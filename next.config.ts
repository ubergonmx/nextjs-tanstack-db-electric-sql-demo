import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Disable cacheStartUrl to avoid the _async_to_generator error in service worker
  cacheStartUrl: false,
  workboxOptions: {
    skipWaiting: true,
    importScripts: ["/push-sw.js"],
  },
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);
