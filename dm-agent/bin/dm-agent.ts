#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DmAgentStack } from "../lib/dm-agent-stack";

const app = new cdk.App();

const agentId =
  app.node.tryGetContext("agentId") ||
  process.env.AGENT_ID ||
  "REPLACE_ME_AGENT_ID";
const aliasId =
  app.node.tryGetContext("aliasId") ||
  process.env.ALIAS_ID ||
  "REPLACE_ME_ALIAS_ID";

new DmAgentStack(app, "DmAgentStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  agentId,
  aliasId,
});
