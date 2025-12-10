// app/api/shop/route.js
import { NextResponse } from 'next/server';
import { SHOP_ITEMS } from '@/lib/redis';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  
  const items = type ? SHOP_ITEMS.filter(item => item.type === type) : SHOP_ITEMS;
  
  const grouped = {};
  SHOP_ITEMS.forEach(item => {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item);
  });
  
  return NextResponse.json({ success: true, data: { items, grouped } });
}
