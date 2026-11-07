/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  roots: ["<rootDir>/src"],
  testEnvironment: "jsdom",
  setupFiles: ["./test/setupFiles.ts"],
  moduleNameMapper: {
    "\\.(png|gif|ogg|glb)$": "<rootDir>/test/__mocks__/assetMock.js",
  },
};
