import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';

class TestStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    new dynamodb.Table(this, "DmGameState", {
      tableName: "dmGameState",
      partitionKey: { name: "playerId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sessionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    new s3.Bucket(this, "DmAssets", {
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    new apigwv2.HttpApi(this, "DmApi", { apiName: "dm-agent-api" });
  }
}

test('DynamoDB Table Created', () => {
  const app = new cdk.App();
  const stack = new TestStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'dmGameState',
    BillingMode: 'PAY_PER_REQUEST'
  });
});

test('S3 Bucket Created', () => {
  const app = new cdk.App();
  const stack = new TestStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::S3::Bucket', 1);
});

test('API Gateway Created', () => {
  const app = new cdk.App();
  const stack = new TestStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Name: 'dm-agent-api'
  });
});
test('Lambda Functions Infrastructure', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'LambdaTestStack');
  
  new lambda.Function(stack, 'TestFunction', {
    runtime: lambda.Runtime.NODEJS_20_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = async () => ({statusCode: 200});')
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs20.x'
  });
});