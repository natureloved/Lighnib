/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lighnib/shared"],
  // The demo is opened as http://localhost:3000, but 127.0.0.1 is the
  // same machine — without this, Next 16 blocks the dev HMR websocket
  // for 127.0.0.1 origins and the page never hydrates (buttons dead).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
