import { handler } from './index';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  process.env.TABLE = 'test-table';
  ddbMock.reset();
});

test('handler returns success for get_character', async () => {
  ddbMock.on(GetCommand).resolves({ Item: { character: 'test-char', world: 'test-world' } });
  
  const event = {
    function: 'get_character',
    parameters: [
      { name: 'playerId', value: 'test' },
      { name: 'sessionId', value: 'session1' }
    ]
  };
  const result = await handler(event);
  expect(result.response).toBeDefined();
  expect(result.response.character).toBe('test-char');
});