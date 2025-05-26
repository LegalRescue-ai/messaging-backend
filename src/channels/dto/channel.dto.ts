/* eslint-disable prettier/prettier */
// Create this file as: src/channels/dto/channel.dto.ts

export class CreateChannelDto {
    clientId: string;
    attorneyId: string;
}

export class CreateChannelMetadataDto {
    channelUrl: string;
    caseId: string;
    fullNames: string;
}