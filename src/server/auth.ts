import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

const secret = config.SESSION_SECRET || config.DASHBOARD_PASSWORD || "disabled";
const sign = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
export function issueSession(res: Response) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const value = `${expires}.${sign(String(expires))}`;
  res.cookie("pw_session", value, { httpOnly: true, sameSite: "strict", secure: config.NODE_ENV === "production", maxAge: 7 * 86400_000 });
}
export function isAuthenticated(req: Request) {
  if (!config.authEnabled) return true;
  const [expires, signature] = String(req.cookies?.pw_session || "").split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticated(req)) next();
  else res.status(401).json({ error: "Authentication required" });
}
export function passwordMatches(value: unknown) {
  const input = Buffer.from(String(value || ""));
  const expected = Buffer.from(config.DASHBOARD_PASSWORD);
  return input.length === expected.length && timingSafeEqual(input, expected);
}
