#!/usr/bin/env python3
"""Prepara pacote privado; nunca usa credenciais nem executa a importação."""
import argparse
import csv
import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re

EMPTY = ('', 'NULL', None)

def read_csv(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        sample = handle.read(8192)
        handle.seek(0)
        return list(csv.DictReader(handle, dialect=csv.Sniffer().sniff(sample, delimiters=',;\t')))

def money(value):
    amount = Decimal('0' if value in EMPTY else value)
    if not amount.is_finite() or abs(amount)>Decimal('1000000000000'):
        raise ValueError('Valor monetário inválido no CSV')
    return amount

def ident(value, optional=False):
    if optional and value in EMPTY + ('0',):
        return None
    if not re.fullmatch(r'[1-9][0-9]*', value or ''):
        raise ValueError('ID inválido no CSV')
    return int(value)

def email(value):
    result = str(value or '').strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', result) or len(result) > 254:
        return None
    return result

def prepare(users, orders, items):
    if any('user_pass' in row or 'user_activation_key' in row for row in users):
        raise ValueError('Não usar exportação que contenha senhas/tokens')
    customers, known, emails = [], {}, set()
    for row in users:
        if any('"'+role+'"' in row['perfil_antigo'] for role in ('administrator','shop_manager')):
            continue
        legacy_id = ident(row['id_antigo'])
        address = email(row['email'])
        if not address or address in emails or legacy_id in known:
            raise ValueError('Cliente com e-mail/ID inválido ou duplicado')
        name = ' '.join(filter(None, [row['primeiro_nome'],row['sobrenome']])).strip() or row['nome_exibido'].strip()
        customers.append({'old_id':legacy_id, 'email':address, 'name':name, 'phone':'' if row['telefone'] in EMPTY else row['telefone'], 'profile':row})
        known[legacy_id] = address
        emails.add(address)
    result_orders, order_map = [], {}
    for row in orders:
        old_id = ident(row['pedido_antigo'])
        if old_id in order_map or row['tipo'] not in ('shop_order','shop_order_refund'):
            raise ValueError('Pedido duplicado ou tipo inesperado')
        amount = money(row['total'])
        if row['moeda'] != 'BRL':
            raise ValueError('Moeda inesperada')
        stamp = datetime.datetime.fromisoformat(row['criado_em_utc'])
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=datetime.timezone.utc)
        owner, review = email(row['email']), False
        old_user = ident(row['usuario_antigo'],optional=True)
        if old_user:
            if old_user not in known or (owner and owner != known[old_user]):
                owner, review = None, True
            else:
                owner = known[old_user]
        if not owner:
            review = True
        entry = {'old_id':old_id,'parent_id':ident(row['pedido_pai'],optional=True),'kind':row['tipo'],'status':row['situacao'],'created_at':stamp.isoformat(),'total':format(amount,'f'),'currency':row['moeda'],'payload':row,'owner_email':owner,'needs_review':review,'visible':row['tipo']=='shop_order' and row['situacao'] not in ('trash','auto-draft')}
        result_orders.append(entry)
        order_map[old_id] = entry
    for order in result_orders:
        if order['kind']=='shop_order_refund':
            parent=order_map.get(order['parent_id'])
            if not parent or parent['kind']!='shop_order':
                raise ValueError('Estorno sem pedido original')
            order['owner_email'],order['needs_review']=parent['owner_email'],parent['needs_review']
    result_items, ids, totals, product_lines = [], set(), {}, set()
    for row in items:
        old_id, order_id = ident(row['item_antigo']), ident(row['pedido_antigo'])
        if old_id in ids or order_id not in order_map or row['tipo_item'] not in ('line_item','shipping','coupon','fee','tax'):
            raise ValueError('Item duplicado, órfão ou tipo inesperado')
        ids.add(old_id)
        result_items.append({'old_id':old_id,'order_id':order_id,'kind':row['tipo_item'],'name':row['nome'],'payload':row})
        if row['tipo_item'] in ('line_item','fee'):
            totals[order_id] = totals.get(order_id,Decimal(0)) + money(row['total']) + money(row['imposto'])
        elif row['tipo_item']=='shipping':
            totals[order_id] = totals.get(order_id,Decimal(0)) + money(row['custo_frete'])
        if row['tipo_item']=='line_item':
            product_lines.add(order_id)
    for order in result_orders:
        if order['visible'] and (order['old_id'] not in product_lines or abs(totals.get(order['old_id'],Decimal(0))-money(order['total']))>Decimal('0.01')):
            raise ValueError('Pedido sem peças ou com diferença de valores: '+str(order['old_id']))
    return {'source':'serenity-woocommerce-hpos-v1','customers':customers,'orders':result_orders,'items':result_items}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--users',required=True);parser.add_argument('--orders',required=True);parser.add_argument('--items',required=True);parser.add_argument('--out',required=True)
    args=parser.parse_args()
    bundle=prepare(read_csv(args.users),read_csv(args.orders),read_csv(args.items))
    encoded=json.dumps(bundle,ensure_ascii=False,separators=(',',':'))
    checksum=hashlib.sha256(encoded.encode()).hexdigest()
    delimiter='$legacy_'+checksum[:20]+'$'
    if delimiter in encoded: raise ValueError('Colisão de delimitador')
    output=Path(args.out);output.mkdir(parents=True,exist_ok=True)
    sql='begin;\nselect public.serenity_legacy_import_v1('+delimiter+encoded+delimiter+'::jsonb);\ncommit;\n'
    (output/'02-importar-dados.sql').write_text(sql,encoding='utf-8')
    summary={'sha256':checksum,'customers':len(bundle['customers']),'orders':sum(o['visible'] for o in bundle['orders']),'refunds':sum(o['kind']=='shop_order_refund' for o in bundle['orders']),'items':len(bundle['items']),'review_order_ids':[o['old_id'] for o in bundle['orders'] if o['visible'] and o['needs_review']],'applied':False}
    (output/'conferencia.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__': main()
