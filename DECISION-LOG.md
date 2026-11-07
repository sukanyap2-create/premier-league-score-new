# บันทึกการตัดสินใจ: แดชบอร์ดพรีเมียร์ลีก

## แนวคิดและการต่อยอด

โจทย์หลักคือทำให้ข้อมูล Premier League ที่กระจายอยู่ใน API ใช้ติดตามได้ง่ายในหน้าเดียว จึงต่อยอดจากการแสดงข้อมูลพื้นฐานเป็นหน้า Home, โปรแกรม/ผล, ตารางคะแนน, สโมสร, รายละเอียดทีม/แมตช์, ค้นหา และตั้งค่า โดยไม่เพิ่มลีกอื่น และไม่สร้างข้อมูลที่ API ไม่มี

**Before → After:** เดิมผู้ใช้ต้องดูข้อมูลพื้นฐานและพึ่ง API โดยตรง; หลังปรับมี navigation แบบ responsive, filters, favorites, club comparison, club/match detail, source/status feedback, cache และข้อมูลสำรองเมื่อ API ใช้งานไม่ได้ การค้นหาสโมสรและการเรียงตารางเป็นการทำงานกับข้อมูลที่โหลดแล้ว จึงไม่เพิ่ม API requests

## Component tree และการไหลของ state

```text
frontend/src/main.jsx
└─ App (DashboardApp)
   ├─ state: page, mode, selections, favorites, filters, theme, refresh key
   ├─ Sidebar / MobileNav
   └─ active page renderer
      ├─ PageHeading / Card / MetricCard / StatusNotice
      ├─ MatchTable / StandingsTable / TeamGrid / PointsChart
      └─ useResource → frontend/src/api.js → /api/*
                            └─ backend/server.js (Express) → football-data.org
```

`useResource` เก็บสถานะ loading, success, unavailable, error และ stale/backup ของแต่ละ resource แยกกัน `StatusNotice` แสดงข้อความที่เข้าใจได้พร้อม `role="status"` หรือ `role="alert"`; รายการว่างมี empty state ของตัวเอง ไม่แปลง error เป็นผลลัพธ์ว่างหรือสำเร็จ

## การแบ่งหน้าที่ React และ Express

- **React:** component, state/props, UI, local filtering/search, favorites และการเรียงข้อมูลที่โหลดมาแล้ว
- **Express:** เก็บ API token ฝั่งเซิร์ฟเวอร์, proxy, allowlist/validate query, จำกัด route เป็น Premier League, queue upstream calls, cache และบันทึก backup
- **การเชื่อมต่อ:** frontend เรียก same-origin `/api`; Vite proxy ส่งไป Express ตาม `PORT` ใน `.env` หรือ `VITE_API_PROXY_TARGET` ไม่มี token ใน bundle

## DSA ที่เชื่อมกับ UX จริง

### Substring index + HashTable (React search)

`frontend/src/App.jsx` สร้างดัชนีเมื่อรายการทีมจาก API เปลี่ยน ด้วย `buildSubstringIndex` ใน `frontend/src/dsa.mjs` แล้วใช้ `searchSubstringIndex` กับช่องค้นหาหน้าสโมสรและหน้าค้นหา ข้อความที่ใช้ค้นรวมชื่อ, short name, TLA และ area; normalize ด้วย NFKC และตัวพิมพ์เล็ก Search hint ใน UI ระบุว่าค้นจากดัชนีใน React และไม่เรียก API เพิ่ม

`HashTable` ใช้ separate chaining และขยาย bucket เมื่อ load factor เกิน 0.75

- แบบเดิม: ทุก keystroke สแกนข้อความของทีมทั้ง `n` รายการ; เวลาขึ้นกับจำนวนทีมและต้นทุนการเปรียบเทียบสตริง
- แบบใหม่: สร้างดัชนีครั้งเดียวหลังโหลดทีม; lookup สำหรับ query ยาว `q` และ collision chain ยาว `c` ใช้ `O(q·(c+1))`; เมื่อกระจาย hash ดี `c` มีค่าน้อย ส่วนกรณีเลวร้ายคือ `O(q·K)` เมื่อมี `K` keys
- ต้นทุน: ถ้าข้อความทีมยาว `L_i`, มี substring entries สูงสุด `O(sum L_i²)` และจำนวนอักขระของ key ที่เก็บรวม `O(sum L_i³)`; การสร้าง substring/hash ใช้ `O(sum L_i³)` งานอักขระ และ geometric rehash เพิ่มได้ไม่เกิน logarithmic factor ของจำนวน keys ในขอบเขตแบบ conservative การแลก memory นี้เหมาะกับข้อมูลทีมเพียง 20 ทีม และ index ถูก memoize ไม่สร้างใหม่ทุก keystroke

### Merge Sort (React standings)

`StandingsTable` ใช้ `mergeSort` ที่เขียนเองเมื่อผู้ใช้เลือกเรียงตามคะแนน, ชนะ, ผลต่างประตู หรือประตูได้; ค่าเริ่มต้นยังเป็นอันดับทางการจาก API โดยตรง แถวที่ค่าเท่ากันคงลำดับเดิมเพราะ sort เป็น stable และคอลัมน์อันดับทางการยังคงแสดงเดิม

- เวลา `O(n log n)` สำหรับ `n` แถว
- auxiliary memory `O(n)`
- UI บอกให้เห็นว่าเลือกการเรียงด้วย Merge Sort แล้ว

## ทางเลือกและข้อแลกเปลี่ยน

เลือกทำ search/sort บน React เพราะข้อมูลมีขนาดเล็กและอยู่ใน browser แล้ว จึงตอบสนองทันทีโดยไม่ใช้โควตา API; ยอมใช้ memory สำหรับ substring index เพื่อหลีกเลี่ยง scan ซ้ำ ส่วน Express รับผิดชอบด้าน credential, input validation, PL-only scope, request quota และ resilience ซึ่งเป็นงานฝั่ง server ที่ UI ทำแทนไม่ได้

## การยืนยันพฤติกรรม

- `npm test` ครอบคลุม stability ของ Merge Sort, HashTable resize, substring lookup/normalization, API validation/rate backup และ helper ของ squad/ownership
- `npm run build` ยืนยัน production bundle
- ระหว่างสาธิต ให้แสดงค้นหาด้วย substring, เปลี่ยนตัวเลือกเรียงตาราง, และชี้ที่ source/status feedback เพื่อเชื่อมโค้ดกับ UX
