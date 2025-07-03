/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DynamoDBClient,
    DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    ScanCommand,
    QueryCommand
} from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamoService implements OnModuleInit {
    private client: DynamoDBClient;
    private docClient: DynamoDBDocumentClient;
    private readonly logger = new Logger(DynamoService.name);

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        this.initializeClient();
    }

    private initializeClient() {
        const config: DynamoDBClientConfig = {
            region: this.configService.get<string>('REGION', 'us-east-1'),
        };



        const accessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
        if (accessKey && secretKey) {
            config.credentials = {
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
            };
        }

        // Configure retry strategy
        config.maxAttempts = this.configService.get<number>('DYNAMODB_MAX_RETRIES', 3);

        // Initialize the clients
        this.client = new DynamoDBClient(config);
        this.docClient = DynamoDBDocumentClient.from(this.client, {
            marshallOptions: {
                convertEmptyValues: true,
                removeUndefinedValues: true,
                convertClassInstanceToMap: true,
            },
            unmarshallOptions: {
                wrapNumbers: false,
            },
        });

        this.logger.log('DynamoDB client initialized');
    }


    getDocumentClient(): DynamoDBDocumentClient {
        return this.docClient;
    }


    getLowLevelClient(): DynamoDBClient {
        return this.client;
    }


    /**
     * Create or replace an item in a table
     * @param tableName The name of the DynamoDB table
     * @param item The item to be put
     * @param conditionExpression Optional condition expression for the operation
     */
    async putItem(tableName: string, item: Record<string, any>, conditionExpression?: string) {
        try {
            const params = {
                TableName: tableName,
                Item: item,
                ...(conditionExpression && { ConditionExpression: conditionExpression }),
            };

            const result = await this.docClient.send(new PutCommand(params));
            return result;
        } catch (error) {
            this.logger.error(`Error putting item in ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Get an item from a table by its key
     * @param tableName The name of the DynamoDB table
     * @param key The primary key of the item to get
     */
    async getItem(tableName: string, key: Record<string, any>) {
        try {
            const params = {
                TableName: tableName,
                Key: key,
            };

            const result = await this.docClient.send(new GetCommand(params));
            return result.Item;
        } catch (error) {
            this.logger.error(`Error getting item from ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Update an item in a table
     * @param tableName The name of the DynamoDB table
     * @param key The primary key of the item to update
     * @param updateExpression The update expression defining what will be modified
     * @param expressionAttributeNames Names for placeholders in updateExpression
     * @param expressionAttributeValues Values for placeholders in updateExpression
     */
    async updateItem(
        tableName: string,
        key: Record<string, any>,
        updateExpression: string,
        expressionAttributeNames?: Record<string, string>,
        expressionAttributeValues?: Record<string, any>,
    ) {
        try {
            const params = {
                TableName: tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
                ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues }),
                ReturnValues: 'ALL_NEW' as const,
            };

            const result = await this.docClient.send(new UpdateCommand(params));
            return result.Attributes;
        } catch (error) {
            this.logger.error(`Error updating item in ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Delete an item from a table
     * @param tableName The name of the DynamoDB table
     * @param key The primary key of the item to delete
     */
    async deleteItem(tableName: string, key: Record<string, any>) {
        try {
            const params = {
                TableName: tableName,
                Key: key,
            };

            return await this.docClient.send(new DeleteCommand(params));
        } catch (error) {
            this.logger.error(`Error deleting item from ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Query items from a table using a key condition expression
     * @param tableName The name of the DynamoDB table
     * @param keyConditionExpression The key condition expression
     * @param expressionAttributeNames Names for placeholders in keyConditionExpression
     * @param expressionAttributeValues Values for placeholders in keyConditionExpression
     * @param indexName Optional index name to query
     * @param limit Optional maximum number of items to evaluate
     * @param exclusiveStartKey Optional starting key for pagination
     */
    async query(
        tableName: string,
        keyConditionExpression: string,
        expressionAttributeNames: Record<string, string>,
        expressionAttributeValues: Record<string, any>,
        indexName?: string,
        limit?: number,
        exclusiveStartKey?: Record<string, any>,
    ) {
        try {
            const params = {
                TableName: tableName,
                KeyConditionExpression: keyConditionExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ...(indexName && { IndexName: indexName }),
                ...(limit && { Limit: limit }),
                ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
            };

            const result = await this.docClient.send(new QueryCommand(params));

            return {
                items: result.Items,
                lastEvaluatedKey: result.LastEvaluatedKey,
            };
        } catch (error) {
            this.logger.error(`Error querying items from ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Scan all items in a table
     * @param tableName The name of the DynamoDB table
     * @param filterExpression Optional filter expression
     * @param expressionAttributeNames Optional names for placeholders in filterExpression
     * @param expressionAttributeValues Optional values for placeholders in filterExpression
     * @param limit Optional maximum number of items to evaluate
     * @param exclusiveStartKey Optional starting key for pagination
     */
    async scan(
        tableName: string,
        filterExpression?: string,
        expressionAttributeNames?: Record<string, string>,
        expressionAttributeValues?: Record<string, any>,
        limit?: number,
        exclusiveStartKey?: Record<string, any>,
    ) {
        try {
            const params = {
                TableName: tableName,
                ...(filterExpression && { FilterExpression: filterExpression }),
                ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
                ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues }),
                ...(limit && { Limit: limit }),
                ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
            };

            const result = await this.docClient.send(new ScanCommand(params));

            return {
                items: result.Items,
                lastEvaluatedKey: result.LastEvaluatedKey,
            };
        } catch (error) {
            this.logger.error(`Error scanning items from ${tableName}`, error);
            throw error;
        }
    }
}