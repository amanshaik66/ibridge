/** @type {import('next').NextConfig} */
const nextConfig = {
  // ssh2 ships a native binary (sshcrypto.node) that webpack must not parse;
  // keep it external and load it at runtime instead.
  experimental: {
    serverComponentsExternalPackages: ["ssh2"],
  },
};
module.exports = nextConfig;
