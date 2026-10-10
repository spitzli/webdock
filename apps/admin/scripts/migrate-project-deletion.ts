import {Pool} from 'pg';
import {deletionSchemaSQL} from '../src/lib/project-deletion';
const pool=new Pool({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,max:1});
try{await pool.query(deletionSchemaSQL);console.log('Project deletion journal ready.');}finally{await pool.end();}
