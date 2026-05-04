import { resolvePaddlePrice, resolvePaddleDiscount } from "@/server/payments.functions";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

declare global {
  interface Window {
    Paddle: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      const env = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
      window.Paddle.Environment.set(env);
      window.Paddle.Initialize({ token: clientToken });
      paddleInitialized = true;
      resolve();
    };
    if (window.Paddle) return finish();
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]',
    );
    if (existing) {
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () => reject(new Error("Paddle.js failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = finish;
    script.onerror = () => reject(new Error("Paddle.js failed to load"));
    document.head.appendChild(script);
  });
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  return resolvePaddlePrice({ data: { priceId, environment: getPaddleEnvironment() } });
}

export async function getPaddleDiscountId(description: string): Promise<string | null> {
  return resolvePaddleDiscount({
    data: { description, environment: getPaddleEnvironment() },
  });
}
