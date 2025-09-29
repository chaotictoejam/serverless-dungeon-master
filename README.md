# Serverless Dungeon Master Agent

A Simple POC Bedrock-powered AI agent that runs entirely on Lambda + DynamoDB to act as a real-time Dungeon Master for tabletop or RPG campaigns. It remembers player choices, generates storylines on the fly, and adapts difficulty levels — all serverlessly.

View detailed blog post on [dev.to](https://dev.to/aws-builders/building-a-serverless-dungeon-master-agent-on-aws-3j7k)

## Features

- **Persistent Character Management**: Create and save character sheets with stats, inventory, and progression
- **Dynamic Storytelling**: AI-generated narratives that adapt to player decisions
- **Session Memory**: Maintains game state and history across multiple sessions
- **Real-time Interaction**: Streaming responses for natural conversation flow
- **Scalable Architecture**: Serverless design handles multiple concurrent campaigns
- **Cost-Effective**: Pay-per-use model with no idle server costs

## Architecture

```
Player → API Gateway → Lambda (session-proxy) → Bedrock Agent
                                                      ↓
                        Lambda (game-actions) ← Action Group
                                ↓
                           DynamoDB
```

- **Amazon Bedrock Agents**: Core AI with system prompt, memory, and action group integration
- **Lambda (session-proxy)**: Handles agent invocation and streams responses back to client
- **Lambda (game-actions)**: Implements game mechanics (character CRUD, session logs) with DynamoDB persistence
- **API Gateway (HTTP API)**: RESTful endpoint exposing `POST /play` for game interactions
- **S3 Static Website**: Simple HTML/JS client for testing and gameplay

## Prerequisites

- **Node.js 20+** and **AWS CDK v2**
- **AWS Account** with Amazon Bedrock access enabled
- **Bedrock Model Access**: Ensure your account has access to your chosen foundation model
- **AWS CLI** configured with appropriate permissions
- **Python 3.8+** (for local development server) - you can also use the VS Code Extension - Live Server

## Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd serverless-dungeon-master/dm-agent
npm install
```

### 2. Deploy Infrastructure
```bash
npx cdk deploy
```

### 3. Configure Web Client
Copy the `ApiUrl` from the deployment output and update `web/index.html`:
```javascript
const API_URL = 'https://your-api-gateway-url.amazonaws.com';
```

### 4. Start Playing
```bash
cd ../web
python serve.py  # or open index.html directly
```
Navigate to `http://localhost:8000` and start your adventure!

## Game Actions

The DM agent supports these core actions:
- **Character Creation**: Generate stats, background, and starting equipment
- **Character Management**: Save/load character progression and inventory
- **Session Logging**: Maintain detailed game history and decision tracking
- **Dynamic Responses**: Contextual storytelling based on character and session state

## Project Structure

```
serverless-dungeon-master/
├── dm-agent/              # AWS CDK infrastructure code
│   ├── lib/               # Stack definitions
│   ├── lambda/            # Lambda function source
│   └── bin/               # CDK app entry point
├── web/                   # Static web client
│   ├── index.html        # Game interface
│   └── serve.py          # Local development server
└── README.md             # This file
```

## Customization

- **System Prompt**: Modify the Bedrock Agent's instructions to change DM personality and rules
- **Game Actions**: Extend `lambda/game-actions` to add new mechanics (dice rolling, combat, etc.)
- **UI/UX**: Enhance the web client with better styling, character sheets, or mobile support
- **Models**: Switch between different Bedrock foundation models for varied storytelling styles

## Cost Considerations

- **Bedrock**: Pay per token for model inference
- **Lambda**: Pay per invocation and execution time
- **DynamoDB**: Pay per read/write operations
- **API Gateway**: Pay per API call
- **S3**: Minimal cost for static hosting

Typical cost for casual gameplay: **$1-5/month**
