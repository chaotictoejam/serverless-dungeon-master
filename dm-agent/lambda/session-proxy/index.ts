import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({});
const AGENT_ID = process.env.AGENT_ID!;
const ALIAS_ID = process.env.ALIAS_ID!;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { sessionId, playerId, inputText } = body;

    if (!sessionId || !playerId || !inputText) {
      return { statusCode: 400, body: JSON.stringify({ error: 'sessionId, playerId, inputText required' }) };
    }

    const userInput = `PLAYER(${playerId}): ${inputText}`;

    const cmd = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: ALIAS_ID,
      sessionId,
      inputText: userInput,
      enableTrace: false,
    });
    const resp: any = await client.send(cmd);

    let text = '';
    for await (const eventChunk of resp.completion) {
      if (eventChunk?.chunk?.bytes) {
        text += new TextDecoder().decode(eventChunk.chunk.bytes);
      }
    }

    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reply: text }) };
  } catch (err) {
    console.error('Error invoking agent:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Agent invocation failed' }) };
  }
};
