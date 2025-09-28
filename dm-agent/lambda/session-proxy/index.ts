import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const bedrockAgent = new BedrockAgentRuntimeClient({ region: "us-east-1" }); // Adjust region as needed 
const AGENT_ID = process.env.AGENT_ID!;
const ALIAS_ID = process.env.ALIAS_ID!;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };

  // Handle preflight OPTIONS request
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { sessionId, playerId, inputText } = body;

    if (!sessionId || !playerId || !inputText) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Missing required parameters',
          missing: [
            !sessionId && 'sessionId',
            !playerId && 'playerId',
            !inputText && 'inputText'
          ].filter(Boolean)
        })
      };
    }

    const contextualInput = `Player ID: ${playerId}, Session ID: ${sessionId}\n\n${inputText}`;
    
    const cmd = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: ALIAS_ID,
      sessionId,
      inputText: contextualInput
    });
    
    console.log('Invoking agent with:', { agentId: AGENT_ID, aliasId: ALIAS_ID, sessionId, inputText: contextualInput });
    const response = await bedrockAgent.send(cmd);
    console.log('Agent response received:', { hasCompletion: !!response.completion });
    
    let text = '';
    
    if (response.completion === undefined) {
      throw new Error("BedRock Agent completion is undefined");
    }

    for await (const chunkEvent of response.completion) {
      const chunk = chunkEvent.chunk;
      console.log(chunk);
      const decodedResponse = new TextDecoder("utf-8").decode(chunk?.bytes);
      text += decodedResponse;
    }
    
    if (!text) {
      text = 'No response from agent';
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply: text })
    };
  } catch (err: any) {
    console.error('Agent invocation error:', {
      message: err.message,
      code: err.code || err.name,
      stack: err.stack,
      agentId: AGENT_ID,
      aliasId: ALIAS_ID
    });
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Agent invocation failed',
        message: err.message || 'Unknown error',
        code: err.code || err.name || 'UnknownError'
      })
    };
  }
};
