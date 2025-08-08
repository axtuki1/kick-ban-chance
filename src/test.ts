import { CloudflareUtils } from "./cloudflare";
import { Logger } from "./util/logger";

require("dotenv").config();

// ただの動確用のやつ

async function Test() {
    
    const logger = new Logger("Test");
    logger.info("Testing CloudflareUtils...");
    
    const rnd = Math.random().toString(36).substring(2, 15);
    logger.info(`Generated random string: ${rnd}`);
    logger.info(`KV Set Record`);
    await CloudflareUtils.SetKVRecord("Test", rnd);

    logger.info("KV Get Record");
    const CurrentRollCount = Number(await (await CloudflareUtils.GetKVRecord("CurrentRollCount")).text()) || 0;
    logger.info(`Retrieved KV Record: ${CurrentRollCount}`);

    // logger.info("D1 Insert Target Player");
    // await CloudflareUtils.InsertTargetPlayer(
    //     "12345",
    //     "TestPlayer",
    //     new Date().toISOString(),
    //     "1 hour",
    //     "join"
    // );
}

Test();
