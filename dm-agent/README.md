# Serverless Dungeon Master - CDK Infrastructure

This CDK project deploys the AWS infrastructure for the Serverless Dungeon Master Agent.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Setup
Create a `.env` file in this directory with the following content, replacing the placeholders with your actual values:
```
ALIAS_ID=your_alias_id_here
AGENT_ID=your_agent_id_here
AGENT_ARN=your_agent_arn_here
CDK_DEFAULT_ACCOUNT=your_aws_account_number
CDK_DEFAULT_REGION=us-east-1
```

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template