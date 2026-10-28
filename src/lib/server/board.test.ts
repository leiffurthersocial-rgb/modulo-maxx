import { describe, expect, it } from "vitest";
import { stats } from "../board";
import { addPost, createBoard, deleteBoard, deletePost, getBoard, getPhoto, ratePost, unratePost, updateBoard } from "./board";
import { MemoryStore } from "./store";

const alice = "voter-alice-0123456789";
const bob = "voter-bob-012345678901";
const carl = "voter-carl-01234567890";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

async function setup(anon = false) {
  const store = new MemoryStore();
  const { id, adminToken } = await createBoard(store, { name: "  The   boys ", anon });
  const { postId, ownerToken } = await addPost(store, id, { name: "Alice", photo: PNG, voter: alice });
  return { store, id, adminToken, postId, ownerToken };
}

describe("group board", () => {
  it("creates a board and a post, and serves the photo", async () => {
    const { store, id, postId } = await setup();
    const b = await getBoard(store, id, alice);
    expect(b.name).toBe("The boys");
    expect(b.posts).toHaveLength(1);
    expect(b.posts[0]).toMatchObject({ name: "Alice", hasPhoto: true, mine: true, ratings: [] });
    expect((await getBoard(store, id, bob)).posts[0].mine).toBeUndefined();
    const photo = await getPhoto(store, id, postId);
    expect(photo.type).toBe("image/png");
  });

  it("keeps one rating per device, shows names unless anonymous, never leaks voter ids", async () => {
    const { store, id, postId, adminToken } = await setup();
    await ratePost(store, id, postId, { voter: bob, score: 6, name: "Bob" });
    await ratePost(store, id, postId, { voter: bob, score: 7.5, name: "Bob" });
    await ratePost(store, id, postId, { voter: carl, score: 5, name: "Carl" });
    let r = (await getBoard(store, id, bob)).posts[0].ratings;
    expect(r.map((x) => x.score).sort()).toEqual([5, 7.5]);
    expect(r.find((x) => x.mine)).toMatchObject({ score: 7.5, name: "Bob" });
    expect(JSON.stringify(r)).not.toContain(bob);

    await updateBoard(store, id, { adminToken, anon: true });
    r = (await getBoard(store, id, carl)).posts[0].ratings;
    expect(r.every((x) => x.name === undefined)).toBe(true);
    await ratePost(store, id, postId, { voter: carl, score: 4 }); // no name needed now
    expect(stats((await getBoard(store, id)).posts[0].ratings)).toMatchObject({ n: 2, mean: 5.75 });

    await unratePost(store, id, postId, carl);
    expect((await getBoard(store, id)).posts[0].ratings).toHaveLength(1);
  });

  it("rejects bad ratings, missing names on named boards, and rating yourself", async () => {
    const { store, id, postId } = await setup();
    await expect(ratePost(store, id, postId, { voter: bob, score: 11, name: "Bob" })).rejects.toMatchObject({ status: 400 });
    await expect(ratePost(store, id, postId, { voter: bob, score: 6.3, name: "Bob" })).rejects.toMatchObject({ status: 400 });
    await expect(ratePost(store, id, postId, { voter: bob, score: 6 })).rejects.toMatchObject({ status: 400 });
    await expect(ratePost(store, id, postId, { voter: alice, score: 9, name: "Alice" })).rejects.toMatchObject({ status: 403 });
  });

  it("lets the poster or the creator delete a post, and nobody else", async () => {
    const { store, id, postId, ownerToken, adminToken } = await setup();
    await expect(deletePost(store, id, postId, "nope")).rejects.toMatchObject({ status: 403 });
    await deletePost(store, id, postId, ownerToken);
    expect((await getBoard(store, id)).posts).toHaveLength(0);
    await expect(getPhoto(store, id, postId)).rejects.toMatchObject({ status: 404 });

    const second = await addPost(store, id, { name: "Bob", voter: bob });
    await deletePost(store, id, second.postId, adminToken);
    expect((await getBoard(store, id)).posts).toHaveLength(0);
  });

  it("only the creator changes settings or deletes the board", async () => {
    const { store, id, adminToken, ownerToken } = await setup();
    await expect(updateBoard(store, id, { adminToken: ownerToken, anon: true })).rejects.toMatchObject({ status: 403 });
    await expect(deleteBoard(store, id, ownerToken)).rejects.toMatchObject({ status: 403 });
    await deleteBoard(store, id, adminToken);
    await expect(getBoard(store, id)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects photos that aren't images", async () => {
    const { store, id } = await setup();
    await expect(addPost(store, id, { name: "X", photo: "data:text/html;base64,PHNjcmlwdD4=", voter: bob })).rejects.toMatchObject({
      status: 400,
    });
  });
});
