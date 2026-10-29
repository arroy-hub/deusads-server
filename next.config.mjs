const nextConfig = {
  experimental: {},
  // The ASTC encoder is a native program the server starts; it is not imported, so it has to be named to be shipped.
  outputFileTracingIncludes: { "/**/*": ["./node_modules/@astcenc/linux-x64/bin/**", "./node_modules/@astcenc/linux-x64/package.json"] },
};
export default nextConfig;
