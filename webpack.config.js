const fs = require("fs");
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const HIT_LOG = path.join(__dirname, "hit-log.md");
const HIT_LOG_TITLE = `# Hit log

Written by \`npm start\` (src/hitLog.ts): one table per run, one row per hit as it lands. Tiles are SDK coordinates
(x east, y south). "Fired" is the tick the orb left the boss (rocks: the tick the shadow appeared). "Dist" is the
Chebyshev distance from the pathfinder's centre; the aura covers 3 or less. "On blue" is whether your tile was blue in
the frames before the hit. "Praying" is the protection the server applied; "Lit" is what the panel showed. "missed"
is a rock that landed off your tile. "Check" flags a hit that breaks the rules: damage on blue with the right prayer,
or a blue tile outside the aura.
`;

/**
 * Dev only: pages post { run, text } here. Each run's rows are kept together, so tabs playing at once do not
 * interleave, and hit-log.md is rewritten after the runs logged before this server started.
 */
function hitLogEndpoint(app) {
  const earlier = fs.existsSync(HIT_LOG) ? fs.readFileSync(HIT_LOG, "utf8") : HIT_LOG_TITLE;
  const runs = new Map();
  app.post("/__hit-log", (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const { run, text } = JSON.parse(body);
        if (typeof run !== "string" || typeof text !== "string") return res.sendStatus(400);
        runs.set(run, (runs.get(run) ?? "") + text);
        fs.writeFileSync(HIT_LOG, earlier + [...runs.values()].join(""));
        res.sendStatus(204);
      } catch {
        res.sendStatus(400);
      }
    });
  });
}

module.exports = {
  entry: "./src/index.ts",
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "",
  },
  devtool: "source-map",
  performance: { hints: false },
  devServer: {
    contentBase: path.join(__dirname, "dist"),
    host: "127.0.0.1",
    port: 8002,
    before: hitLogEndpoint,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "public/osrs-assets", to: "osrs-assets", noErrorOnMissing: true },
        { from: "index.html", to: "", context: "src/" },
        { from: "*.png", to: "", context: "node_modules/osrs-sdk/_bundles/", noErrorOnMissing: true },
        { from: "*.gif", to: "", context: "node_modules/osrs-sdk/_bundles/", noErrorOnMissing: true },
        { from: "*.ogg", to: "", context: "node_modules/osrs-sdk/_bundles/", noErrorOnMissing: true },
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ogg|gltf|glb)$/i,
        type: "asset/resource",
      },
    ],
  },
};
