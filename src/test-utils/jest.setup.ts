import dotenvFlow from "dotenv-flow";

dotenvFlow.config({ node_env: process.env.NODE_ENV || "test" });

