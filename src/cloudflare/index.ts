import Cloudflare from "cloudflare";
import { Logger } from "../util/logger";
import uuid from "ui7";


/**
 * 一旦Staticでおちゃにごし
 */
export class CloudflareUtils {
    public static async InsertTargetPlayer(playerId, playerName, joinDate, joinDuration, action, startCount) {
        let logger = new Logger("Cloudflare");
        try {
            const client = new Cloudflare({
                apiToken: process.env.CLOUDFLARE_API_TOKEN,
            });
            await client.d1.database.query(
                process.env.CLOUDFLARE_DATABASE_ID,
                {
                    account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
                    sql: `INSERT INTO history (uuid, date, playerId, displayName, joinDate, joinDuration, action, startCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    params: [
                        uuid(),
                        new Date().toISOString(),
                        playerId,
                        playerName,
                        joinDate,
                        joinDuration,
                        action,
                        startCount
                    ]
                }
            );
        } catch (error) {
            logger.error("Error inserting into D1 database: " + error);
        }
    }

    public static async GetKVRecord(key) {
        let logger = new Logger("Cloudflare");
        try {
            const client = new Cloudflare({
                apiToken: process.env.CLOUDFLARE_API_TOKEN,
            });
            const value = await client.kv.namespaces.values.get(
                process.env.CLOUDFLARE_KV_NAMESPACE_ID,
                key,
                {
                    account_id: process.env.CLOUDFLARE_ACCOUNT_ID
                }
            );
            logger.debug(`Get KV record: ${key}`);
            return value;
        } catch (error) {
            logger.error("Error getting KV record: " + error);
            return null;
        }
    }

    public static async SetKVRecord(key, value) {
        let logger = new Logger("Cloudflare");
        try {
            const client = new Cloudflare({
                apiToken: process.env.CLOUDFLARE_API_TOKEN,
            });
            await client.kv.namespaces.values.update(
                process.env.CLOUDFLARE_KV_NAMESPACE_ID,
                key,
                {
                    account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
                    value: value,
                }
            );
            logger.debug(`Set KV record: ${key}`);
        } catch (error) {
            logger.error("Error setting KV record: " + error);
        }
    }
}