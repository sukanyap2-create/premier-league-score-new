export function mergeSort(items, compare) {
  if (items.length < 2) return items.slice();

  const middle = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);
  const sorted = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (compare(left[leftIndex], right[rightIndex]) <= 0) {
      sorted.push(left[leftIndex++]);
    } else {
      sorted.push(right[rightIndex++]);
    }
  }

  return sorted.concat(left.slice(leftIndex), right.slice(rightIndex));
}

export class HashTable {
  constructor(bucketCount = 53) {
    this.buckets = Array.from({ length: Math.max(1, Math.floor(bucketCount)) }, () => []);
    this.size = 0;
  }

  hash(key) {
    const text = String(key);
    let value = 2166136261;
    for (let index = 0; index < text.length; index++) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0) % this.buckets.length;
  }

  set(key, value) {
    const bucket = this.buckets[this.hash(String(key))];
    const existing = bucket.find(entry => entry[0] === key);
    if (existing) {
      existing[1] = value;
    } else {
      bucket.push([key, value]);
      this.size++;
      if (this.size > this.buckets.length * 0.75) this.resize();
    }
    return this;
  }

  get(key) {
    const entry = this.buckets[this.hash(String(key))].find(item => item[0] === key);
    return entry ? entry[1] : undefined;
  }

  resize() {
    const entries = this.buckets.flat();
    this.buckets = Array.from({ length: this.buckets.length * 2 + 1 }, () => []);
    this.size = 0;
    entries.forEach(([key, value]) => this.set(key, value));
  }
}

export function buildSubstringIndex(items, getText) {
  const index = new HashTable();
  items.forEach(item => {
    const text = String(getText(item) ?? '').normalize('NFKC').toLocaleLowerCase();
    const substrings = new Set();
    for (let start = 0; start < text.length; start++) {
      for (let end = start + 1; end <= text.length; end++) {
        substrings.add(text.slice(start, end));
      }
    }
    substrings.forEach(substring => {
      const matches = index.get(substring) || [];
      matches.push(item);
      index.set(substring, matches);
    });
  });
  return index;
}

export function searchSubstringIndex(index, query) {
  const normalizedQuery = String(query ?? '').normalize('NFKC').toLocaleLowerCase().trim();
  return normalizedQuery ? index.get(normalizedQuery) || [] : [];
}
