import {Pool,type PoolClient} from 'pg';
import {parseCanvasDocument,type CanvasDocument,type CanvasPage,type CanvasPageSummary,type CanvasList} from './model.ts';
export class CanvasError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export type CanvasCommand=
 |{action:'create';document:CanvasDocument}
 |{action:'save';id:number;expectedRevision:number;document:CanvasDocument}
 |{action:'publish'|'unpublish';id:number;expectedRevision:number}
 |{action:'homepage';id:number|null;expectedRevision?:number};
const columns='id,draft,revision::int AS "draftRevision",published,published_revision::int AS "publishedRevision",published_at AS "publishedAt",updated_at AS "updatedAt"';
const iso=(value:unknown)=>value===null?null:new Date(value as string|Date).toISOString();
function page(row:Record<string,unknown>):CanvasPage{return {id:Number(row.id),draft:parseCanvasDocument(row.draft),draftRevision:Number(row.draftRevision),published:row.published===null?null:parseCanvasDocument(row.published),publishedRevision:row.publishedRevision===null?null:Number(row.publishedRevision),publishedAt:iso(row.publishedAt),updatedAt:iso(row.updatedAt)!};}
export function canvasID(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>2147483647)throw new CanvasError('Ungültige Seiten-ID.');return Number(value);}
export function canvasRevision(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>2147483646)throw new CanvasError('Ungültiger Versionsstand.');return Number(value);}
export function canvasActor(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new CanvasError('Ungültiger Bearbeiter.',403);return value;}
export class CanvasStore{
 private pool:Pool;private prefix:string;private options:{schema:string;nativePath:string;connectionString?:string;pool?:Pool};
 constructor(options:{schema:string;nativePath:string;connectionString?:string;pool?:Pool}){
  this.options=options;
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(options.schema))throw Error('Invalid instance schema');
  if(!['/original','/shop'].includes(options.nativePath))throw Error('Invalid native website path');
  this.prefix=`"${options.schema}".`;this.pool=options.pool||new Pool({connectionString:options.connectionString,max:2,connectionTimeoutMillis:10000});
 }
 async close(){await this.pool.end();}
 async list():Promise<CanvasList>{
  const rows=await this.pool.query(`SELECT id,draft->>'title' AS title,draft->>'slug' AS slug,revision::int AS "draftRevision",published_revision::int AS "publishedRevision",published_slug AS "publishedSlug",updated_at AS "updatedAt" FROM ${this.prefix}site_pages ORDER BY id DESC LIMIT 100`);
  const settings=await this.pool.query(`SELECT settings FROM ${this.prefix}site_builder WHERE id=1`);
  if(!settings.rows[0])throw new CanvasError('Der Seiteneditor ist noch nicht initialisiert.',503);
  return {pages:rows.rows.map(r=>({...r,updatedAt:iso(r.updatedAt)!})) as CanvasPageSummary[],homePageID:settings.rows[0].settings.homePageID??null,nativePath:this.options.nativePath};
 }
 async get(id:number):Promise<CanvasPage>{canvasID(id);const result=await this.pool.query(`SELECT ${columns} FROM ${this.prefix}site_pages WHERE id=$1`,[id]);if(!result.rows[0])throw new CanvasError('Seite nicht gefunden.',404);return page(result.rows[0]);}
 async publishedBySlug(slug:string):Promise<CanvasDocument|null>{if(slug.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;const result=await this.pool.query(`SELECT published FROM ${this.prefix}site_pages WHERE published_slug=$1 AND published IS NOT NULL`,[slug]);return result.rows[0]?parseCanvasDocument(result.rows[0].published):null;}
 async activePublished():Promise<CanvasDocument|null>{const result=await this.pool.query(`SELECT p.published FROM ${this.prefix}site_builder b JOIN ${this.prefix}site_pages p ON p.id=(b.settings->>'homePageID')::integer WHERE b.id=1 AND p.published IS NOT NULL`);return result.rows[0]?parseCanvasDocument(result.rows[0].published):null;}
 private async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();try{await client.query('BEGIN');
   // ponytail: one per-site lock serializes infrequent editor writes and the 100-page bound.
   // Replace with separate quota/home locks only if editing contention becomes measurable.
   const settings=await client.query(`SELECT id FROM ${this.prefix}site_builder WHERE id=1 FOR UPDATE`);
   if(!settings.rowCount)throw new CanvasError('Der Seiteneditor ist noch nicht initialisiert.',503);
   const result=await work(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')throw new CanvasError('Diese öffentliche Seitenadresse wird bereits verwendet.',409);throw error;}finally{client.release();}
 }
 private async locked(client:PoolClient,id:number,expectedRevision:number){canvasID(id);canvasRevision(expectedRevision);const result=await client.query(`SELECT ${columns} FROM ${this.prefix}site_pages WHERE id=$1 FOR UPDATE`,[id]);if(!result.rows[0])throw new CanvasError('Seite nicht gefunden.',404);const current=page(result.rows[0]);if(current.draftRevision!==expectedRevision)throw new CanvasError('Die Seite wurde zwischenzeitlich geändert. Bitte neu laden; Ihr Entwurf bleibt erhalten.',409);return current;}
 async create(document:CanvasDocument,actor:string):Promise<CanvasPage>{const draft=parseCanvasDocument(document);canvasActor(actor);return this.transaction(async c=>{const count=await c.query(`SELECT count(*)::int AS total FROM ${this.prefix}site_pages`);if(count.rows[0].total>=100)throw new CanvasError('Pro Website sind höchstens 100 Canvas-Seiten möglich.',409);const row=await c.query(`INSERT INTO ${this.prefix}site_pages(draft,revision,updated_by) VALUES($1,1,$2) RETURNING ${columns}`,[JSON.stringify(draft),actor]);return page(row.rows[0]);});}
 async save(id:number,expectedRevision:number,document:CanvasDocument,actor:string):Promise<CanvasPage>{const draft=parseCanvasDocument(document);canvasActor(actor);return this.transaction(async c=>{await this.locked(c,id,expectedRevision);const row=await c.query(`UPDATE ${this.prefix}site_pages SET draft=$2,revision=revision+1,updated_by=$3,updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') WHERE id=$1 RETURNING ${columns}`,[id,JSON.stringify(draft),actor]);return page(row.rows[0]);});}
 async publish(id:number,expectedRevision:number,actor:string):Promise<CanvasPage>{canvasActor(actor);return this.transaction(async c=>{const current=await this.locked(c,id,expectedRevision);const row=await c.query(`UPDATE ${this.prefix}site_pages SET published=draft,published_slug=$2,revision=revision+1,published_revision=revision+1,published_at=date_trunc('milliseconds',clock_timestamp()),published_by=$3,updated_by=$3,updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') WHERE id=$1 RETURNING ${columns}`,[id,current.draft.slug,actor]);return page(row.rows[0]);});}
 async unpublish(id:number,expectedRevision:number,actor:string):Promise<CanvasPage>{canvasActor(actor);return this.transaction(async c=>{await this.locked(c,id,expectedRevision);await c.query(`UPDATE ${this.prefix}site_builder SET settings='{"homePageID":null}'::jsonb,updated_at=clock_timestamp() WHERE id=1 AND (settings->>'homePageID')::integer=$1`,[id]);const row=await c.query(`UPDATE ${this.prefix}site_pages SET published=NULL,published_slug=NULL,published_revision=NULL,published_at=NULL,revision=revision+1,updated_by=$2,updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') WHERE id=$1 RETURNING ${columns}`,[id,actor]);return page(row.rows[0]);});}
 async homepage(id:number|null,expectedRevision:number|undefined,actor:string):Promise<{homePageID:number|null}>{canvasActor(actor);return this.transaction(async c=>{if(id!==null){const current=await this.locked(c,id,canvasRevision(expectedRevision));if(!current.published||current.publishedRevision!==current.draftRevision)throw new CanvasError('Die aktuelle Seitenversion muss vor der Startseitenzuordnung veröffentlicht sein.',409);}await c.query(`UPDATE ${this.prefix}site_builder SET settings=$1,updated_at=clock_timestamp() WHERE id=1`,[JSON.stringify({homePageID:id})]);return {homePageID:id};});}
 async execute(command:CanvasCommand,actor:string):Promise<{page:CanvasPage}|{homePageID:number|null}>{switch(command.action){case'create':return {page:await this.create(command.document,actor)};case'save':return {page:await this.save(command.id,command.expectedRevision,command.document,actor)};case'publish':return {page:await this.publish(command.id,command.expectedRevision,actor)};case'unpublish':return {page:await this.unpublish(command.id,command.expectedRevision,actor)};case'homepage':return this.homepage(command.id,command.expectedRevision,actor);}}
}
