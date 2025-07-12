import * as fs from "fs";
import { Msg } from "./util/msg";
import * as OTPAuth from "otpauth";
import { Logger, Level } from "./util/logger";
import { VRChat } from "./vrchat";
import { Discord } from "./discord";
import { parse } from "jsonc-parser";
const config = (() => {
    const json = fs.readFileSync("./config/config.jsonc");
    return parse(json.toString());
})();
const package_json = require('../package.json');

const replace = (str: string, data: Record<string, string>): string => {
    return str.replace(/{(\w+)}/g, (match, key) => {
        return data[key] || match;
    }
    );
}

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
    // グループメンバーの取得
    const groupId = process.env.GROUP_ID;

    try {

        if (!groupId) {
            throw new Error("GROUP_ID environment variable must be set.");
        }

        const members_origin = await vrchat.GetGroupMembers(groupId, 100, 0, "joinedAt:asc");

        // { userId: string, joinedAt: string } の形式でメンバー情報を整形
        let members = members_origin.map(member => ({
            userId: member.userId,
            joinedAt: new Date(member.joinedAt).toLocaleString("ja-JP", {
                year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", second: "2-digit"
            })
        }));

        // 除外するユーザーIDのリスト
        const excludeUserIds = (process.env.EXCLUDE_USER_ID || "").split("\n").map(id => id.trim()).filter(id => id !== "");
        logger.debug("Excluding user IDs: " + excludeUserIds.join(", "));
        // 除外ユーザーをフィルタリング
        members = members.filter(member => !excludeUserIds.includes(member.userId));

        const groupInfo = await vrchat.GetGroupInfo(groupId);
        logger.info("Target Group Name: " + groupInfo.name);
        logger.info("Total Group Members: " + groupInfo.memberCount);

        const groupMemberCount = groupInfo.memberCount - excludeUserIds.length;

        // 人数不足
        const requiredPlayerCount = parseInt(process.env.REQUIRED_PLAYER_COUNT || "0");
        if (groupMemberCount < requiredPlayerCount) {
            logger.info("Not enough members to kick/ban. Required: " + requiredPlayerCount + ", Found: " + members.length);
            await discord.sendMessage("Not enough members to kick/ban. Required: " + requiredPlayerCount + ", Found: " + members.length);

            vrchat.UpdateGroupPost(
                groupId,
                replace(
                    config.postTemplate.content.nonEnoughPlayers.join("\n"),
                    {
                        "date": new Date().toLocaleString("ja-JP", {
                            year: "numeric", month: "2-digit", day: "2-digit"
                        }),
                        "player_count": groupMemberCount.toString()
                    }
                ),
                config.postTemplate.content.nonEnoughPlayers.join("\n").replace("{player_count}", groupMemberCount.toString()),
                false
            )

            return;
        }

        // 抽選実施
        const kickPercent = parseFloat(process.env.KICK_CHANCE_PERCENT || "0");
        const banPercent = parseFloat(process.env.BAN_CHANCE_PERCENT || "0");

        if (kickPercent < 0 || kickPercent > 100 || banPercent < 0 || banPercent > 100) {
            throw new Error("KICK_CHANCE_PERCENT and BAN_CHANCE_PERCENT must be between 0 and 100.");
        }

        const totalChance = kickPercent + banPercent;
        const roll = Math.random() * 100;  // 0.00 ～ 99.99

        if (roll >= totalChance) {
            await vrchat.UpdateGroupPost(
                groupId,
                config.postTemplate.title,
                replace(
                    config.postTemplate.content.noPick.join("\n"),
                    {
                        "date": new Date().toLocaleString("ja-JP", {
                            year: "numeric", month: "2-digit", day: "2-digit"
                        }),
                        "player_count": groupMemberCount.toString()
                    }
                ),
                false
            )
            return;
        }

        try {
            const banWeight = banPercent / totalChance;
            const subRoll = Math.random();

            const action = subRoll < banWeight ? "ban" : "kick";

            const selectedMember = members[Math.floor(Math.random() * members.length)];
            logger.info(`Selected member: ${selectedMember.userId} for action: ${action}`);

            const joinDuration = new Date().getTime() - new Date(selectedMember.joinedAt).getTime();

            // 日数(小数点以下2桁)に変換
            const joinDurationDays = (joinDuration / (1000 * 60 * 60 * 24)).toFixed(2);

            // JSTに変換
            const joinedAtJST = new Date(selectedMember.joinedAt).toLocaleString("ja-JP", {
                year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", second: "2-digit"
            });
            // ユーザー情報の取得
            const userId = selectedMember.userId;
            const userInfo = await vrchat.GetUserInfo(selectedMember.userId);
            logger.info(`Selected user info: ${userId} - ${userInfo.displayName}`);

            if (action === "ban") {
                await vrchat.UpdateGroupPost(
                    groupId,
                    config.postTemplate.title,
                    replace(
                        config.postTemplate.content.ban.join("\n"),
                        {
                            "date": new Date().toLocaleString("ja-JP", {
                                year: "numeric", month: "2-digit", day: "2-digit"
                            }),
                            "player_name": userInfo.displayName,
                            "joined_at": joinedAtJST,
                            "joinDuration": joinDurationDays
                        }
                    ),
                    false
                );
                await vrchat.BanUser(groupId, selectedMember.userId);
                logger.info(`Banned user: ${selectedMember.userId}`);
                await discord.sendMessage(`Banned user: ${selectedMember.userId} (${joinedAtJST})`);
            } else {
                await vrchat.UpdateGroupPost(
                    groupId,
                    config.postTemplate.title,
                    replace(
                        config.postTemplate.content.kick.join("\n"),
                        {
                            "date": new Date().toLocaleString("ja-JP", {
                                year: "numeric", month: "2-digit", day: "2-digit"
                            }),
                            "player_name": userInfo.displayName,
                            "joined_at": joinedAtJST,
                            "joinDuration": joinDurationDays
                        }
                    ),
                    false
                );
                await vrchat.KickUser(groupId, selectedMember.userId);
                logger.info(`Kicked user: ${selectedMember.userId}`);
                await discord.sendMessage(`Kicked user: ${selectedMember.userId} (${joinedAtJST})`);
            }
        } catch (error) {
            // コケたらはずれってことでお茶を濁す
            await vrchat.UpdateGroupPost(
                groupId,
                config.postTemplate.title,
                replace(
                    config.postTemplate.content.noPick.join("\n"),
                    {
                        "date": new Date().toLocaleString("ja-JP", {
                            year: "numeric", month: "2-digit", day: "2-digit"
                        }),
                        "player_count": groupMemberCount.toString()
                    }
                ),
                false
            )
            throw error;
        }

    } catch (error) {
        logger.error("An error occurred: " + error);
        await discord.sendMessage("An error occurred: " + error);
    }

}

Main();
