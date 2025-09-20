import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface DmAgentStackProps extends cdk.StackProps {
  agentId: string;
  aliasId: string;
}

export class DmAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DmAgentStackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "DmGameState", {
      tableName: "dmGameState",
      partitionKey: { name: "playerId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sessionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    const bucket = new s3.Bucket(this, "DmAssets", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const gameActionsFn = new NodejsFunction(this, "GameActionsFn", {
      entry: "../lambda/game-actions/index.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: { TABLE: table.tableName },
    });
    table.grantReadWriteData(gameActionsFn);

    const sessionProxyFn = new NodejsFunction(this, "SessionProxyFn", {
      entry: "../lambda/session-proxy/index.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        AGENT_ID: props.agentId,
        ALIAS_ID: props.aliasId,
      },
    });
    
    // Load agent ARN from .env
    const agentArn = process.env.AGENT_ARN || "*";

    sessionProxyFn.addToRolePolicy(
      new iam.PolicyStatement({
      actions: [
        "bedrock:InvokeAgent",
        "bedrock:InvokeAgentWithResponseStream",
      ],
      resources: [agentArn], // Use agent ARN from .env
      })
    );

    const api = new apigwv2.HttpApi(this, "DmApi", { apiName: "dm-agent-api" });
    api.addRoutes({
      path: "/play",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "PlayIntegration",
        sessionProxyFn
      ),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint! });
    new cdk.CfnOutput(this, "AssetsBucket", { value: bucket.bucketName });
  }
}