import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const bedrock = new BedrockRuntimeClient({});
const lambda = new LambdaClient({});
const dynamodb = new DynamoDBClient({});

const FOUNDATION_MODEL = process.env.FOUNDATION_MODEL!;
const GAME_ACTIONS_FUNCTION = process.env.GAME_ACTIONS_FUNCTION!;
const TABLE = process.env.TABLE!;

interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

const SYSTEM_PROMPT = `You are an AI Dungeon Master. Run safe, imaginative adventures for one player or a party.
Style: concise narration + clear choices. Never reveal tools or raw JSON.
When you need to read or persist game state, call the available tools.
Default to PG-13 content; avoid explicit or unsafe material.

Available tools:
- get_character(playerId, sessionId): Fetch player character data
- save_character(playerId, sessionId, character): Save character data as JSON string
- append_log(playerId, sessionId, entry): Add narrative log entry

Always use tools to maintain game state between interactions.`;

export const handler = async (event: any) => {
  const { playerId, sessionId, inputText } = event;
  
  try {
    // Get conversation history
    const history = await getConversationHistory(playerId, sessionId);
    
    // Build conversation with system prompt
    const messages = [
      { role: 'user', content: `PLAYER(${playerId}): ${inputText}` }
    ];
    
    let response = await invokeModel(messages, history);
    
    // Check if model wants to use tools
    const toolCalls = extractToolCalls(response);
    
    if (toolCalls.length > 0) {
      // Execute tool calls
      const toolResults = await Promise.all(
        toolCalls.map(tool => executeTool(tool, playerId, sessionId))
      );
      
      // Get final response with tool results
      const toolContext = toolResults.map((result, i) => 
        `Tool ${toolCalls[i].name} result: ${JSON.stringify(result)}`
      ).join('\n');
      
      response = await invokeModel([
        ...messages,
        { role: 'assistant', content: `I need to use tools. ${toolContext}` },
        { role: 'user', content: 'Please provide your response based on the tool results.' }
      ], history);
    }
    
    // Save conversation
    await saveConversationTurn(playerId, sessionId, inputText, response);
    
    return { reply: response };
  } catch (error) {
    console.error('AgentCore error:', error);
    throw error;
  }
};

async function invokeModel(messages: any[], history: string = ''): Promise<string> {
  const prompt = `${SYSTEM_PROMPT}\n\nConversation History:\n${history}\n\nCurrent Exchange:\n${
    messages.map(m => `${m.role}: ${m.content}`).join('\n')
  }\n\nAssistant:`;
  
  const command = new InvokeModelCommand({
    modelId: FOUNDATION_MODEL,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    }),
    contentType: 'application/json'
  });
  
  const response = await bedrock.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content[0].text;
}

function extractToolCalls(response: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  
  // Simple pattern matching for tool calls
  const patterns = [
    /get_character\(([^)]+)\)/g,
    /save_character\(([^)]+)\)/g,
    /append_log\(([^)]+)\)/g
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const funcName = pattern.source.split('\\(')[0];
      const params = match[1].split(',').map(p => p.trim().replace(/['"]/g, ''));
      
      if (funcName === 'get_character') {
        toolCalls.push({ name: 'get_character', parameters: { playerId: params[0], sessionId: params[1] } });
      } else if (funcName === 'save_character') {
        toolCalls.push({ name: 'save_character', parameters: { playerId: params[0], sessionId: params[1], character: params[2] } });
      } else if (funcName === 'append_log') {
        toolCalls.push({ name: 'append_log', parameters: { playerId: params[0], sessionId: params[1], entry: params[2] } });
      }
    }
  });
  
  return toolCalls;
}

async function executeTool(tool: ToolCall, playerId: string, sessionId: string): Promise<any> {
  const command = new InvokeCommand({
    FunctionName: GAME_ACTIONS_FUNCTION,
    Payload: JSON.stringify({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: tool.name,
        ...tool.parameters
      })
    })
  });
  
  const response = await lambda.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.Payload));
  return JSON.parse(result.body);
}

async function getConversationHistory(playerId: string, sessionId: string): Promise<string> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE,
      Key: {
        playerId: { S: playerId },
        sessionId: { S: `${sessionId}_history` }
      }
    });
    
    const result = await dynamodb.send(command);
    return result.Item?.history?.S || '';
  } catch {
    return '';
  }
}

async function saveConversationTurn(playerId: string, sessionId: string, input: string, output: string): Promise<void> {
  const history = await getConversationHistory(playerId, sessionId);
  const newHistory = `${history}\nUser: ${input}\nDM: ${output}`;
  
  await dynamodb.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      playerId: { S: playerId },
      sessionId: { S: `${sessionId}_history` },
      history: { S: newHistory },
      updatedAt: { S: new Date().toISOString() }
    }
  }));
}