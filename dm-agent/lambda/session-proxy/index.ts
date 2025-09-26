import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const AGENT_CORE_FUNCTION = process.env.AGENT_CORE_FUNCTION!;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const corsHeaders = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept',
  };

  // Handle preflight OPTIONS request
  if (event.requestContext.http.method === 'OPTIONS') {
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
        body: JSON.stringify({ error: 'sessionId, playerId, inputText required' })
      };
    }

    const cmd = new InvokeCommand({
      FunctionName: AGENT_CORE_FUNCTION,
      Payload: JSON.stringify({ playerId, sessionId, inputText })
    });
    
    const resp = await lambda.send(cmd);
    const result = JSON.parse(new TextDecoder().decode(resp.Payload));
    const text = result.reply || 'No response from agent';

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply: text })
    };
  } catch (err) {
    console.error('Error invoking agent:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Agent invocation failed' })
    };
  }
};
