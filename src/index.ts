import { Msg } from "./util/msg";
import * as OTPAuth from "otpauth";
import { Logger, Level } from "./util/logger";
import { VRChat } from "./vrchat";
import { Discord } from "./discord";
const package_json = require('../package.json');

console.log("///////////////////////////////////////////////");
console.log("       " + package_json.name + " v" + package_json.version);
console.log("///////////////////////////////////////////////");


const Main = async () => {

    if (!process.env.APIKEY || !process.env.EMAIL || !process.env.PASSWORD) {
        console.error("APIKEY, EMAIL, and PASSWORD environment variables must be set.");
        return;
    }

    Logger.level = (process.env.LOGLEVEL as Level) || "info";
    let logger = new Logger("Main");

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

    const exitProcess = async () => {
        console.log("Exitting...");
    }

    process.on("SIGINT", async () => {
        await exitProcess();
        process.exit(0);
    });


}

Main();
