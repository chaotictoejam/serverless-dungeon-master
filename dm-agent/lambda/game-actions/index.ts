import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE!;

type AgentParam = { name?: string; key?: string; value: any };
type AgentEvent = { function?: string; name?: string; parameters?: AgentParam[] };

function toParamMap(params?: AgentParam[]) {
  const p = params || [];
  const entries = p.map((pp) => [pp.name ?? pp.key, pp.value]);
  return Object.fromEntries(entries);
}

function ok(body: any) {
  return { response: body, messageVersion: '1.0' };
}

export const handler = async (event: any) => {
  console.log('Received action event:', JSON.stringify(event));
  
  // Handle direct Lambda invocation from AgentCore
  if (event.body && typeof event.body === 'string') {
    const body = JSON.parse(event.body);
    const fn = body.action;
    const params = { ...body };
    delete params.action;
    
    const result = await executeAction(fn, params);
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  }
  
  // Handle Bedrock Agent format (legacy)
  const fn = event.function ?? event.name ?? 'unknown';
  const params = toParamMap(event.parameters);
  
  return ok(await executeAction(fn, params));
};

async function executeAction(fn: string, params: any) {

  if (fn === 'get_character') {
    const { playerId, sessionId } = params;
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { playerId, sessionId },
    }));
    return { character: res.Item?.character ?? null, world: res.Item?.world ?? null };
  }

  if (fn === 'save_character') {
    const { playerId, sessionId, character } = params;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { playerId, sessionId },
      UpdateExpression: 'SET character = :c, lastUpdated = :t',
      ExpressionAttributeValues: { ':c': character, ':t': Date.now() },
    }));
    return { status: 'saved' };
  }

  if (fn === 'append_log') {
    const { playerId, sessionId, entry } = params;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { playerId, sessionId },
      UpdateExpression:
        'SET world.logs = list_append(if_not_exists(world.logs, :empty), :e), lastUpdated = :t',
      ExpressionAttributeValues: { ':e': [entry], ':empty': [], ':t': Date.now() },
    }));
    return { status: 'logged' };
  }

  return { notice: `Unknown function: ${fn}`, echo: params };
};
