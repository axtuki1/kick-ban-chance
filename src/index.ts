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

// Date型を"YYYY年MM月D日"形式の文字列に変換する関数
const formatDate = (date: Date): string => {
    const parts = date.toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).split("/");
    return `${parts[0]}年${parts[1]}月${parts[2]}日`;
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

        // 除外するユーザーIDのリスト
        const excludeUserIds = (process.env.EXCLUDE_USER_ID || "").split("\n").map(id => id.trim()).filter(id => id !== "");
        logger.debug("Excluding user IDs: " + excludeUserIds.join(", "));

        // const members_origin = await vrchat.GetGroupMembers(groupId, 100, 0, "joinedAt:asc");

        // // { userId: string, joinedAt: string } の形式でメンバー情報を整形
        // let members = members_origin.map(member => ({
        //     userId: member.userId,
        //     joinedAt: new Date(member.joinedAt)
        // }));

        // // 除外ユーザーをフィルタリング
        // members = members.filter(member => !excludeUserIds.includes(member.userId));

        const groupInfo = await vrchat.GetGroupInfo(groupId);
        logger.info("Target Group Name: " + groupInfo.name);
        logger.info("Total Group Members: " + groupInfo.memberCount);

        const groupMemberCount = groupInfo.memberCount - excludeUserIds.length;

        // 人数不足
        const requiredPlayerCount = parseInt(process.env.REQUIRED_PLAYER_COUNT || "0");
        if (groupMemberCount < requiredPlayerCount) {
            logger.info("Not enough members to kick/ban. Required: " + requiredPlayerCount + ", Found: " + groupMemberCount);
            await discord.sendMessage("Not enough members to kick/ban. Required: " + requiredPlayerCount + ", Found: " + groupMemberCount);

            vrchat.UpdateGroupPost(
                groupId,
                config.postTemplate.title,
                replace(
                    config.postTemplate.content.nonEnoughPlayers.join("\n"),
                    {
                        "date": formatDate(new Date()),
                        "player_count": groupMemberCount.toString(),
                        "required_player_count": requiredPlayerCount.toString()
                    }
                ),
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

        logger.info("Roll result: " + roll.toString() + ", totalChance: " + totalChance.toString() + " (" + kickPercent.toString() + " + " + banPercent.toString() + ") ");
        
        if (roll >= totalChance) {
            await discord.sendMessage("Not selected in the draw.");
            await vrchat.UpdateGroupPost(
                groupId,
                config.postTemplate.title,
                replace(
                    config.postTemplate.content.noPick.join("\n"),
                    {
                        "date": formatDate(new Date()),
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

            logger.debug("subRoll: " + subRoll.toString() + " < banWeight: " + banWeight.toString());

            let selectedMember;
            let tryCount = 0;
            do {
                // グループメンバーからランダムに1人選ぶ
                selectedMember = await vrchat.GetGroupMembers(groupId, 1, Math.floor(Math.random() * groupInfo.memberCount), "joinedAt:asc")[0];
                tryCount++;
                if (tryCount > 100) {
                    // 100回試行しても見つからなかった場合は、最新のメンバーを取得
                    selectedMember = await vrchat.GetGroupMembers(groupId, 1, 0, "joinedAt:desc")[0];
                }
            // 除外ユーザーIDに含まれていないことを確認
            } while (excludeUserIds.includes(selectedMember.userId));
            logger.info(`Selected member: ${selectedMember.userId} for action: ${action}`);

            const joinDuration = new Date().getTime() - new Date(selectedMember.joinedAt).getTime();

            // 日数(小数点以下2桁)に変換
            const joinDurationDays = (joinDuration / (1000 * 60 * 60 * 24)).toFixed(2);

            // JSTに変換
            const joinedAtJST = formatDate(new Date(selectedMember.joinedAt));
            
            // ユーザー情報の取得
            const userId = selectedMember.userId;
            const userInfo = await vrchat.GetUserInfo(selectedMember.userId);
            logger.info(`Selected user info: ${userInfo.displayName}`);

            if (action === "ban") {
                await vrchat.UpdateGroupPost(
                    groupId,
                    config.postTemplate.title,
                    replace(
                        config.postTemplate.content.ban.join("\n"),
                        {
                            "date": formatDate(new Date()),
                            "player_name": userInfo.displayName,
                            "joined_at": joinedAtJST,
                            "joinDuration": joinDurationDays
                        }
                    ),
                    true
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
                            "date": formatDate(new Date()),
                            "player_name": userInfo.displayName,
                            "joined_at": joinedAtJST,
                            "joinDuration": joinDurationDays
                        }
                    ),
                    true
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
                        "date": formatDate(new Date()),
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
