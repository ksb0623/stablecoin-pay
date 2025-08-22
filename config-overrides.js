// config-overrides.js
const webpack = require("webpack");
const path = require("path");

module.exports = function override(config) {
  // ① ESM import fully-specified 강제 해제 (process/browser 같은 확장자 없는 import 허용)
  config.resolve.fullySpecified = false;

  // ② alias 에 process/browser 를 명시적으로 매핑
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    "process/browser": require.resolve("process/browser"), // ★ 핵심
  };

  // ③ 기존 fallback 유지 + 보강
  config.resolve.fallback = {
    ...config.resolve.fallback,
    buffer: require.resolve("buffer/"),
    stream: require.resolve("stream-browserify"),
    crypto: require.resolve("crypto-browserify"),
    path: require.resolve("path-browserify"),
    os: require.resolve("os-browserify/browser"),
    assert: require.resolve("assert/"),
    util: require.resolve("util/"),
    process: require.resolve("process/browser"),
    timers: require.resolve("timers-browserify"),
    url: require.resolve("url/"),
    vm: require.resolve("vm-browserify"),
    console: require.resolve("console-browserify"),
    constants: require.resolve("constants-browserify"),
    http: require.resolve("stream-http"),
    https: require.resolve("https-browserify"),
  };

  // ④ ProvidePlugin 으로 전역 process/Buffer 주입
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    }),
  ];

  return config;
};
