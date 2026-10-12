export const MAIL_LIMITS = {
 recipients:50,batch:100,scheduleDays:30,jsonBytes:4_000_000,contentBytes:512*1024,
 attachments:10,attachmentBytes:2*1024*1024,subjectBytes:998,tags:50,headers:50,headerBytes:16*1024,
 callbackBytes:1024*1024,callbackEvents:500,page:100,requestsPerMinute:120,recipientsPerMinute:1000,
 keysPerHour:10,pendingSchedules:1000,
} as const;
