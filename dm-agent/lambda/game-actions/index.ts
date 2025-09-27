import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE!;

type AgentParam = { name?: string; key?: string; value: any };
type AgentEvent = {
  function?: string;
  name?: string;
  parameters?: AgentParam[];
};

function toParamMap(params?: AgentParam[]) {
  const p = params || [];
  const entries = p.map((pp) => [pp.name ?? pp.key, pp.value]);
  return Object.fromEntries(entries);
}

function ok(body: any, functionName: string) {
  const response = {
    messageVersion: "1.0",
    response: {
      actionGroup: "GameActions",
      function: functionName,
      functionResponse: {
        responseBody: body
      }
    }
  };
  console.log('Returning response:', JSON.stringify(response, null, 2));
  return response;
}

export const handler = async (event: AgentEvent) => {
  console.log("Received action event:", JSON.stringify(event));

  try {
    const fn = event.function ?? event.name ?? "unknown";
    const params = toParamMap(event.parameters);

    if (fn === "get_character") {
      const { playerId, sessionId } = params;
      const res = await ddb.send(
        new GetCommand({
          TableName: TABLE,
          Key: { playerId, sessionId },
        })
      );
      const character = res.Item?.playerCharacter ? JSON.parse(res.Item.playerCharacter) : null;
      return ok({
        character: character,
        world: res.Item?.world ?? null,
      }, "get_character");
    }

    if (fn === "save_character") {
      const { playerId, sessionId, character } = params;
      console.log('Saving character:', { playerId, sessionId, character });
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { playerId, sessionId },
          UpdateExpression: "SET playerCharacter = :c, lastUpdated = :t",
          ExpressionAttributeValues: { ":c": character, ":t": Date.now() },
        })
      );
      console.log('Character saved successfully');
      return ok({ status: "saved" }, "save_character");
    }

    if (fn === "append_log") {
      const { playerId, sessionId, entry } = params;
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { playerId, sessionId },
          UpdateExpression:
            "SET #world = if_not_exists(#world, :emptyWorld), #world.#logs = list_append(if_not_exists(#world.#logs, :empty), :e), lastUpdated = :t",
          ExpressionAttributeNames: { "#world": "world", "#logs": "logs" },
          ExpressionAttributeValues: {
            ":e": [entry],
            ":empty": [],
            ":emptyWorld": {},
            ":t": Date.now(),
          },
        })
      );
      return ok({ status: "logged" }, "append_log");
    }

    return ok({ notice: `Unknown function: ${fn}`, echo: params }, fn);
  } catch (error: any) {
    console.error("Error in game actions:", error);
    return ok({ error: error.message || "Unknown error" }, "error");
  }
};
