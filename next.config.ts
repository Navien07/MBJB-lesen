import type { NextConfig } from "next";

// No middleware in this app — auth is enforced server-side in every protected
// page/action via requireUser/requireOfficer (lib/auth.ts), and RLS is the
// real boundary underneath. Vercel's middleware wrapper also proved
// incompatible with the supabase client bundle (__dirname ReferenceError).
const nextConfig: NextConfig = {};

export default nextConfig;
