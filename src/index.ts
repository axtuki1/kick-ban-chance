import { Msg } from "./util/msg";
import * as OTPAuth from "otpauth";
import { Logger, Level } from "./util/logger";
import { VRChat } from "./vrchat";
import { Discord } from "./discord";
const package_json = require('../package.json');

const Main = async () => {

    Logger.level = (process.env.LOGLEVEL as Level) || "info";
    let logger = new Logger("Main");

    logger.info("///////////////////////////////////////////////");
    logger.info("       " + package_json.name + " v" + package_json.version);
    logger.info("///////////////////////////////////////////////");

    if (!process.env.APIKEY || !process.env.EMAIL || !process.env.PASSWORD) {
        console.error("APIKEY, EMAIL, and PASSWORD environment variables must be set.");
        return;
    }

    logger.info("-------");
    logger.info("");
    logger.info("starting " + package_json.name + " v" + package_json.version);

    const vrchat = new VRChat(
        process.env.APIKEY,
        process.env.EMAIL,
        process.env.PASSWORD,
        package_json.name + "/v" + package_json.version + " " + package_json.github + " " + process.env.CONTACT,
        "secret",
        process.env.TWOFACTOR,
    );

    let isLogin = false;

    await vrchat.LoginCheck().then((result) => {
        isLogin = vrchat.isLogin;
    }).catch((e) => {
        logger.info("LoginCheck: " + e);
        isLogin = false;
    });

    logger.info("Login check: " + Msg.YesNo(isLogin));

    if (!isLogin) {
        await vrchat.Login().then(async (result) => {
            if (result.requiresTwoFactorAuth) {
                await vrchat.TwoFactorAuth();
            }
        });
    }

    if (!vrchat.isLogin) {
        logger.info("Login failed...");

    } else {
        logger.info("Login Success!");
    }

    const discord = new Discord(process.env.DISCORD_WEBHOOK_URL || "");

    try {

        // グループメンバーの取得
        const groupId = process.env.GROUP_ID;
        if (!groupId) {
            throw new Error("GROUP_ID environment variable must be set.");
        }

        const members_origin = await vrchat.GetGroupMembers(groupId, 100, 0, "joinedAt:asc");

        logger.debug(JSON.stringify(members_origin, null, 2));

        // { userId: string, displayName: string, joinedAt: string } の形式でメンバー情報を整形
        let members = members_origin.map(member => ({
            userId: member.userId,
            displayName: member.displayName,
            joinedAt: new Date(member.joinedAt).toLocaleString("ja-JP", {
                year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", second: "2-digit"
            })
        }));

        logger.info(`Retrieved ${members_origin.length} members from group ${groupId}.`);

        // 除外するユーザーIDのリスト
        const excludeUserIds = (process.env.EXCLUDE_USER_ID || "").split("\n").map(id => id.trim()).filter(id => id !== "");
        // 除外ユーザーをフィルタリング
        members = members.filter(member => !excludeUserIds.includes(member.userId));
        // メンバー情報をDiscordに送信
        if (members.length > 0) {
            const message = members.map(member => `UserID: ${member.userId}, DisplayName: ${member.displayName}, JoinedAt: ${member.joinedAt}`).join("\n");
            await discord.sendMessage("Group Members:\n" + message);
            logger.info("Group members sent to Discord.");
        }
        else {
            await discord.sendMessage("No members found in the group or all members were excluded.");
            logger.info("No members found or all members were excluded.");
        }



    } catch (error) {
        logger.error("An error occurred: " + error);
        await discord.sendMessage("An error occurred: " + error);
    }

}

Main();
