drop function if exists public.trending_saved_dupes(integer, integer, integer);

create function public.trending_saved_dupes(
  p_limit integer default 20,
  p_min_saves integer default 2,
  p_window_days integer default null
)
returns table (
  pair_key text,
  latest_scan_id uuid,
  save_count bigint,
  last_saved_at timestamptz,
  original_brand text,
  original_product_name text,
  original_image_url text,
  original_price_usd numeric,
  dupe_brand text,
  dupe_product_name text,
  dupe_image_url text,
  dupe_price_usd numeric,
  match_score integer,
  verdict text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    md5(
      lower(s.original_brand) || '|' ||
      lower(s.original_product_name) || '|' ||
      lower(coalesce(s.dupe_brand, '')) || '|' ||
      lower(coalesce(s.dupe_product_name, ''))
    ) as pair_key,
    (array_agg(s.id order by ss.created_at desc))[1] as latest_scan_id,
    count(distinct ss.user_id) as save_count,
    max(ss.created_at) as last_saved_at,
    (array_agg(s.original_brand        order by ss.created_at desc))[1] as original_brand,
    (array_agg(s.original_product_name order by ss.created_at desc))[1] as original_product_name,
    (array_agg(s.original_image_url    order by ss.created_at desc))[1] as original_image_url,
    (array_agg(nullif(s.analysis #>> '{original,estimatedPriceUsd}', '')::numeric order by ss.created_at desc))[1] as original_price_usd,
    (array_agg(s.dupe_brand            order by ss.created_at desc))[1] as dupe_brand,
    (array_agg(s.dupe_product_name     order by ss.created_at desc))[1] as dupe_product_name,
    (array_agg(s.dupe_image_url        order by ss.created_at desc))[1] as dupe_image_url,
    (array_agg(nullif(s.analysis #>> '{dupe,estimatedPriceUsd}', '')::numeric order by ss.created_at desc))[1] as dupe_price_usd,
    (array_agg(s.match_score           order by ss.created_at desc))[1] as match_score,
    (array_agg(s.verdict               order by ss.created_at desc))[1] as verdict
  from public.saved_scans ss
  join public.scans s on s.id = ss.scan_id
  where s.dupe_product_name is not null
    and (p_window_days is null or ss.created_at >= now() - (p_window_days || ' days')::interval)
  group by 1
  having count(distinct ss.user_id) >= p_min_saves
  order by save_count desc, last_saved_at desc
  limit p_limit;
$$;