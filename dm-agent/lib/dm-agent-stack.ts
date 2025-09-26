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
    const fmId = this.node.tryGetContext("fmId") || process.env.FM_ID || "anthropic.claude-3-5-sonnet-20241022-v2:0";
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

    // AgentCore orchestration Lambda
    const agentCoreFn = new lambdaNode.NodejsFunction(this, "AgentCoreFn", {
      entry: "./lambda/agent-core/index.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      environment: {
        TABLE: table.tableName,
        GAME_ACTIONS_FUNCTION: gameActionsFn.functionName,
        FOUNDATION_MODEL: fmId,
      },
    });
    
    // Grant permissions for AgentCore
    agentCoreFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["*"],
    }));
    
    agentCoreFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [gameActionsFn.functionArn],
    }));
    
    table.grantReadWriteData(agentCoreFn);

    // Session Proxy Lambda
    const sessionProxyFn = new lambdaNode.NodejsFunction(this, "SessionProxyFn", {
      entry: "./lambda/session-proxy/index.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        AGENT_CORE_FUNCTION: agentCoreFn.functionName,
      },
    });
    sessionProxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [agentCoreFn.functionArn],
    }));

    // API Gateway
    const api = new apigwv2.HttpApi(this, "DmApi", {
      apiName: "dm-agent-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ["content-type"],
      },
    });
    
    api.addRoutes({
      path: "/play",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration("PlayIntegration", sessionProxyFn),
    });

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint! });
    new cdk.CfnOutput(this, "AssetsBucket", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "AgentCoreFunctionName", { value: agentCoreFn.functionName });
  }
}