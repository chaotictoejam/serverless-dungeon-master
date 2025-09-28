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
  actionGroup: string;
  function: string;
  parameters?: AgentParam[];
};

function toParamMap(params?: AgentParam[]) {
  const p = params || [];
  const entries = p.map((pp) => [pp.name ?? pp.key, pp.value]);
  return Object.fromEntries(entries);
}

function ok(functionName: string, body: any) {
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: "GameActions",
      function: functionName,
      functionResponse: {
        responseBody: {
          TEXT: {
            body: JSON.stringify(body),
          },
        },
      },
    },
  };
}

export const handler = async (event: AgentEvent) => {
  console.log("Received action event:", JSON.stringify(event));

  try {
    const fn = event.function;
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
      return ok(fn, {
        character: character,
        world: res.Item?.world ?? null,
      });
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
      return ok(fn, { status: "saved" });
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
      return ok(fn, { status: "logged" });
    }

    return ok(fn, { notice: `Unknown function: ${fn}`, echo: params });
  } catch (error: any) {
    console.error("Error in game actions:", error);
    return ok(event.function || "unknown", { error: error.message || "Unknown error" });
  }
};
