export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      dupes: {
        Row: {
          attribute_match: number | null
          created_at: string
          dupe_product_id: string
          id: string
          ingredient_match: number | null
          original_product_id: string
          overall_match: number
          rank: number | null
          rationale: string | null
          shared_ingredients_count: number | null
          source: string
        }
        Insert: {
          attribute_match?: number | null
          created_at?: string
          dupe_product_id: string
          id?: string
          ingredient_match?: number | null
          original_product_id: string
          overall_match: number
          rank?: number | null
          rationale?: string | null
          shared_ingredients_count?: number | null
          source?: string
        }
        Update: {
          attribute_match?: number | null
          created_at?: string
          dupe_product_id?: string
          id?: string
          ingredient_match?: number | null
          original_product_id?: string
          overall_match?: number
          rank?: number | null
          rationale?: string | null
          shared_ingredients_count?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "dupes_dupe_product_id_fkey"
            columns: ["dupe_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dupes_original_product_id_fkey"
            columns: ["original_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_queue: {
        Row: {
          attempts: number
          brand_slug: string
          created_at: string
          id: string
          last_error: string | null
          mode: string
          priority: number
          processed_at: string | null
          product_id: string | null
          product_slug: string | null
          reason: string
          status: string
        }
        Insert: {
          attempts?: number
          brand_slug: string
          created_at?: string
          id?: string
          last_error?: string | null
          mode?: string
          priority?: number
          processed_at?: string | null
          product_id?: string | null
          product_slug?: string | null
          reason?: string
          status?: string
        }
        Update: {
          attempts?: number
          brand_slug?: string
          created_at?: string
          id?: string
          last_error?: string | null
          mode?: string
          priority?: number
          processed_at?: string | null
          product_id?: string | null
          product_slug?: string | null
          reason?: string
          status?: string
        }
        Relationships: []
      }
      product_link_cache: {
        Row: {
          brand_slug: string
          id: string
          product_slug: string
          resolved_at: string
          source: string
          vendors: Json
        }
        Insert: {
          brand_slug: string
          id?: string
          product_slug: string
          resolved_at?: string
          source?: string
          vendors?: Json
        }
        Update: {
          brand_slug?: string
          id?: string
          product_slug?: string
          resolved_at?: string
          source?: string
          vendors?: Json
        }
        Relationships: []
      }
      product_vendors: {
        Row: {
          currency: string
          fetched_at: string
          id: string
          merchant: string
          price_usd: number | null
          product_id: string
          rank: number
          url: string
        }
        Insert: {
          currency?: string
          fetched_at?: string
          id?: string
          merchant: string
          price_usd?: number | null
          product_id: string
          rank?: number
          url: string
        }
        Update: {
          currency?: string
          fetched_at?: string
          id?: string
          merchant?: string
          price_usd?: number | null
          product_id?: string
          rank?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_vendors_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_name: string
          brand_slug: string
          category: string | null
          contains: string[]
          created_at: string
          free_from: string[]
          good_for: string[]
          id: string
          image_url: string | null
          ingredients: string[]
          ingredients_count: number | null
          last_ingested_at: string | null
          last_priced_at: string | null
          lowest_price_usd: number | null
          product_name: string
          product_slug: string
          search_vector: unknown
          source_url: string | null
          updated_at: string
          variant_id: number | null
        }
        Insert: {
          brand_name: string
          brand_slug: string
          category?: string | null
          contains?: string[]
          created_at?: string
          free_from?: string[]
          good_for?: string[]
          id?: string
          image_url?: string | null
          ingredients?: string[]
          ingredients_count?: number | null
          last_ingested_at?: string | null
          last_priced_at?: string | null
          lowest_price_usd?: number | null
          product_name: string
          product_slug: string
          search_vector?: unknown
          source_url?: string | null
          updated_at?: string
          variant_id?: number | null
        }
        Update: {
          brand_name?: string
          brand_slug?: string
          category?: string | null
          contains?: string[]
          created_at?: string
          free_from?: string[]
          good_for?: string[]
          id?: string
          image_url?: string | null
          ingredients?: string[]
          ingredients_count?: number | null
          last_ingested_at?: string | null
          last_priced_at?: string | null
          lowest_price_usd?: number | null
          product_name?: string
          product_slug?: string
          search_vector?: unknown
          source_url?: string | null
          updated_at?: string
          variant_id?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          onboarding_answers: Json
          onboarding_completed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          onboarding_answers?: Json
          onboarding_completed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          onboarding_answers?: Json
          onboarding_completed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_scans: {
        Row: {
          created_at: string
          id: string
          scan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scan_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_scans_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          analysis: Json
          created_at: string
          dupe_brand: string | null
          dupe_image_url: string | null
          dupe_product_name: string | null
          id: string
          match_score: number | null
          original_brand: string
          original_image_url: string | null
          original_product_name: string
          thumbnail_data_url: string | null
          user_id: string
          verdict: string | null
        }
        Insert: {
          analysis: Json
          created_at?: string
          dupe_brand?: string | null
          dupe_image_url?: string | null
          dupe_product_name?: string | null
          id?: string
          match_score?: number | null
          original_brand: string
          original_image_url?: string | null
          original_product_name: string
          thumbnail_data_url?: string | null
          user_id: string
          verdict?: string | null
        }
        Update: {
          analysis?: Json
          created_at?: string
          dupe_brand?: string | null
          dupe_image_url?: string | null
          dupe_product_name?: string | null
          id?: string
          match_score?: number | null
          original_brand?: string
          original_image_url?: string | null
          original_product_name?: string
          thumbnail_data_url?: string | null
          user_id?: string
          verdict?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          customer_email: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      set_ingestion_token_db_secret: {
        Args: { p_token: string }
        Returns: string
      }
      set_ingestion_token_secret: { Args: { p_token: string }; Returns: string }
      trending_saved_dupes: {
        Args: { p_limit?: number; p_min_saves?: number; p_window_days?: number }
        Returns: {
          dupe_brand: string
          dupe_image_url: string
          dupe_price_usd: number
          dupe_product_name: string
          last_saved_at: string
          latest_scan_id: string
          match_score: number
          original_brand: string
          original_image_url: string
          original_price_usd: number
          original_product_name: string
          pair_key: string
          save_count: number
          verdict: string
        }[]
      }
      verify_ingestion_token: { Args: { p_token: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
