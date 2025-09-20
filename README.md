# Serverless Dungeon Master Agent (AWS Bedrock + Lambda)

This repo contains an MVP that lets players chat with a Bedrock Agent acting as a Dungeon Master. It persists game state in DynamoDB via Agent action group calls.

## Architecture
- **Amazon Bedrock Agents**: system prompt, memory, and an action group bound to a Lambda function.
- **Lambda (session-proxy)**: invokes the Agent Runtime and returns streamed text.
- **Lambda (game-actions)**: implements stateful tools (get/save character, append logs) backed by **DynamoDB**.
- **API Gateway (HTTP API)**: exposes `POST /play`.
- **S3 / Static Web**: minimal HTML client.

## Prereqs
- Node.js 18+ and AWS CDK v2
- AWS account with **Amazon Bedrock** access to your chosen model

## Deploy
```bash
cd cdk
npm install
# Set your Agent & Alias IDs (or pass via context)
export AGENT_ID=REPLACE_ME_AGENT_ID
export ALIAS_ID=REPLACE_ME_ALIAS_ID
npm run deploy
```
Grab the `ApiUrl` output, paste it into `web/index.html`, and open the file to chat with your DM.