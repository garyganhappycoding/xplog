/** @type {import('next').NextConfig} */
const nextConfig = {
  // Loaded from node_modules at runtime instead of being bundled (it has native/optional
  // dependencies that don't bundle cleanly on Vercel).
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
