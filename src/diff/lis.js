/**
 * 가장 긴 증가 부분 수열(LIS)의 "인덱스"를 돌려준다. O(n log n)
 *
 * key 목록 비교에서 쓴다. 새 순서대로 늘어놓은 "이전 위치" 수열에서 증가하는 가장 긴 부분은
 * 서로의 상대 순서가 이미 맞는 노드들이라 그대로 두고, 나머지만 옮기면 이동 횟수가 최소가 된다.
 *
 *   이전 [a b c d] → 새 [d a b c]  : 이전 위치 수열 [3 0 1 2] → LIS = [0 1 2] (a b c 고정) → d만 이동
 *
 * tails[k]: 길이 k+1인 증가 수열들의 마지막 값 중 가장 작은 값의 인덱스
 * prev[i]: 수열을 거꾸로 복원하기 위한 i 바로 앞 원소의 인덱스
 */
export function longestIncreasingSubsequence(arr) {
  const tails = [];
  const prev = new Array(arr.length);

  for (let i = 0; i < arr.length; i += 1) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[tails[mid]] < arr[i]) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }

  const result = new Array(tails.length);
  let k = tails.length > 0 ? tails[tails.length - 1] : -1;
  for (let i = tails.length - 1; i >= 0; i -= 1) {
    result[i] = k;
    k = prev[k];
  }
  return result;
}
