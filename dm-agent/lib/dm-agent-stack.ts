import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as bedrock from "aws-cdk-lib/aws-bedrock";

export class DmAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Configuration
    const fmId = this.node.tryGetContext("fmId") || process.env.FM_ID || "anthropic.claude-3-5-sonnet-20240620-v2:0";
    const agentName = this.node.tryGetContext("agentName") || process.env.AGENT_NAME || "DungeonMaster";

    // DynamoDB Table
    const table = new dynamodb.Table(this, "DmGameState", {
      tableName: "dmGameState",
      partitionKey: { name: "playerId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sessionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // S3 Bucket
    const bucket = new s3.Bucket(this, "DmAssets", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Game Actions Lambda
    const gameActionsFn = new lambdaNode.NodejsFunction(this, "GameActionsFn", {
      entry: "./lambda/game-actions/index.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: { TABLE: table.tableName },
    });
    table.grantReadWriteData(gameActionsFn);

    // Bedrock Agent IAM Role
    const agentServiceRole = new iam.Role(this, "AgentServiceRole", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": cdk.Aws.ACCOUNT_ID } },
      }),
      description: "Service role for Agents for Amazon Bedrock to invoke models and call tools",
    });
    agentServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["*"],
    }));

    // Bedrock Agent
    const agent = new bedrock.CfnAgent(this, "DmAgent", {
      agentName,
      foundationModel: fmId,
      agentResourceRoleArn: agentServiceRole.roleArn,
      instruction: [
        "You are an AI Dungeon Master. Run safe, imaginative adventures for one player or a party.",
        "Style: concise narration + clear choices. Never reveal tools or raw JSON.",
        "When you need to read or persist game state, call the GameActions tools.",
        "Default to PG-13 content; avoid explicit or unsafe material.",
      ].join(" "),
      idleSessionTtlInSeconds: 900,
      autoPrepare: true,
      actionGroups: [{
        actionGroupName: "GameActions",
        description: "Game state operations (DynamoDB-backed)",
        actionGroupExecutor: { lambda: gameActionsFn.functionArn },
        functionSchema: {
          functions: [
            {
              name: "get_character",
              description: "Fetch a player character by playerId + sessionId",
              parameters: {
                playerId: { type: "string", description: "Player identifier", required: true },
                sessionId: { type: "string", description: "Session identifier", required: true },
              },
            },
            {
              name: "save_character",
              description: "Save/replace the player character",
              parameters: {
                playerId: { type: "string", description: "Player identifier", required: true },
                sessionId: { type: "string", description: "Session identifier", required: true },
                character: { type: "object", description: "Character data", required: true },
              },
            },
            {
              name: "append_log",
              description: "Append a narrative log entry to world state",
              parameters: {
                playerId: { type: "string", description: "Player identifier", required: true },
                sessionId: { type: "string", description: "Session identifier", required: true },
                entry: { type: "string", description: "Log entry text", required: true },
              },
            },
          ],
        },
        actionGroupState: "ENABLED",
      }],
    });

    // Lambda permissions for Bedrock
    gameActionsFn.addPermission("AllowBedrockInvoke", {
      principal: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceAccount: cdk.Aws.ACCOUNT_ID,
      sourceArn: agent.attrAgentArn,
    });

    // Bedrock Agent Alias
    const alias = new bedrock.CfnAgentAlias(this, "DmAgentAlias", {
      agentId: agent.attrAgentId,
      agentAliasName: "prod",
      description: "Primary alias for DM agent",
    });

    // Session Proxy Lambda
    const sessionProxyFn = new lambdaNode.NodejsFunction(this, "SessionProxyFn", {
      entry: "./lambda/session-proxy/index.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        AGENT_ID: agent.attrAgentId,
        ALIAS_ID: alias.attrAgentAliasId,
      },
    });
    sessionProxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeAgent", "bedrock:InvokeAgentWithResponseStream"],
      resources: [
        // Use the exact FM ARN for your region if possible for least privilege:
        // e.g., `arn:aws:bedrock:${cdk.Aws.REGION}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v2:0`
        '*', // ← tighten to your FM ARN when you finalize the model choice
        ],
    }));

    // API Gateway
    const api = new apigwv2.HttpApi(this, "DmApi", { apiName: "dm-agent-api" });
    api.addRoutes({
      path: "/play",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("PlayIntegration", sessionProxyFn),
    });

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint! });
    new cdk.CfnOutput(this, "AssetsBucket", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "AgentId", { value: agent.attrAgentId });
    new cdk.CfnOutput(this, "AgentArn", { value: agent.attrAgentArn });
    new cdk.CfnOutput(this, "AgentAliasId", { value: alias.attrAgentAliasId });
  }
}