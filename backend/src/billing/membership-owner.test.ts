import test from 'node:test';
import assert from 'node:assert/strict';
import {membershipBelongsToUser as owns} from './membership-owner.js';
test('foreign, anonymous and conflicting receipts do not grant access',()=>{
 const user={sub:'alice',email:'alice@example.test'};
 assert.equal(owns({user:{email:'bob@example.test'}},user),false);
 assert.equal(owns({},user),false);
 assert.equal(owns({metadata:{supabase_user_id:'bob'},user:{email:user.email}},user),false);
 assert.equal(owns({user:{email:' ALICE@example.test '}},user),true);
 assert.equal(owns({metadata:{supabase_user_id:'alice'}},user),true);
});
