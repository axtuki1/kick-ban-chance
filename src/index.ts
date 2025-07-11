import * as fs from "fs";
import { Msg } from "./util/msg";
import * as OTPAuth from "otpauth";
import { Logger } from "./util/logger";
import { VRChat } from "./vrchat";
import { Discord } from "./discord";
const { parse } = require("jsonc-parser");
const config = (() => {
    const json = fs.readFileSync("./config/config.json");
    return parse(json.toString());
})();
const bodyParser = require('body-parser');
const package_json = require('../package.json');

console.log("///////////////////////////////////////////////");
console.log("       " + package_json.name + " v" + package_json.version);
console.log("///////////////////////////////////////////////");

if (!fs.existsSync("secret")) {
    fs.mkdirSync("secret");
}

const DEBUGLOG = (sender, value) => {
    if (!config.debug) return;
    console.log("[" + sender + "]--------");
    console.log(value);
}

const userAgent = package_json.name + "/v" + package_json.version + " " + package_json.github + " " + config.contact;


const Main = async () => {

    Logger.level = config.logLevel || "info";
    let logger = new Logger("Main");

    logger.info("-------");
    logger.info("");
    logger.info("starting " + package_json.name + " v" + package_json.version);

    const vrchat = new VRChat(
        process.env.apiKey,
        process.env.email,
        process.env.password,
        package_json.name + "/v" + package_json.version + " " + package_json.github + " " + process.env.contact,
        "secret",
        process.env.twoFactor,
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

    const exitProcess = async () => {
        console.log("Exitting...");
    }

    process.on("SIGINT", async () => {
        await exitProcess();
        process.exit(0);
    });


}

Main();
