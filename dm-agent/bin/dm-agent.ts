#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DmAgentStack } from "../lib/dm-agent-stack";

const app = new cdk.App();


new DmAgentStack(app, "DmAgentStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  }
});
