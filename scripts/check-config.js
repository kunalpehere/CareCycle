try {
    const { env } = await import("../src/config/env.js");
    console.log(`CareCycle configuration is valid for ${env.nodeEnv}. Database, URLs and secrets are not printed. No connection was attempted.`);
} catch (error) {
    console.error(error.name === "ConfigurationError" ? error.message : "Configuration could not be loaded. Check the documented environment settings.");
    process.exitCode = 1;
}
