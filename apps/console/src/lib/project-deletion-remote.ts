import 'server-only';
import {studioCall} from './studio-client';
import type {ProjectDeletionView} from '@webdock/api-client/lifecycle';
export const previewProjectDeletion=(_actor:unknown,id:string)=>studioCall<ProjectDeletionView>('project.preview',[id]);
