import { Accountability, SchemaOverview } from '@directus/shared/types';

type authOptions = {
    accountability?: Accountability;
    collection?: String;
};

type Permissions = {
    collection: string | undefined
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
};

export class AuthenticationService {
    accountability: Accountability | null;
    collection: String | null | undefined;
    permissions: Permissions;
    constructor(options: authOptions) {
        this.accountability = options.accountability || null;
        this.collection = options.collection || null;
        this.permissions = this.accountability?.permissions?.reduce((a,c)=>{
            a[c.collection] = a[c.collection] || {};
            a[c.collection][c.action] = true;
            return a;
        },{}) || {};
    }
    checkRead(): boolean {
        return this.accountability && this.collection && this.accountability.permissions.find(x=>x.collection===collection && x.actiopn === 'read' ) === this.collection;
    }
    checkCreate(): boolean {
        return this.accountability && this.collection && this.accountability.permissions.find(x=>x.collection===collection && x.actiopn === 'create' ) === this.collection;
    }
    checkDelete(): boolean {
        return this.accountability && this.collection && this.accountability.permissions.find(x=>x.collection===collection && x.actiopn === 'delete' ) === this.collection;
    }
    checkUpdate(): boolean {
        return this.accountability && this.collection && this.accountability.permissions.find(x=>x.collection===collection && x.actiopn === 'update' ) === this.collection;
    }
}
