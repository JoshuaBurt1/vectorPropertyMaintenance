"use client";

import { useState, useEffect } from "react";

const words = ["home.", "yard.", "driveway.", "warehouse.", "garage.", "office.", "backroom.", "parking lot."];

export default function Typewriter() {
  const [hasMounted, setHasMounted] = useState(false);  
  const [index, setIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Blinking cursor effect
  useEffect(() => {
    const timeout2 = setTimeout(() => {
      setBlink((prev) => !prev);
    }, 500);
    return () => clearTimeout(timeout2);
  }, [blink]);

  // Typing logic
  useEffect(() => {
    if (!hasMounted) return;

    if (subIndex === words[index].length + 1 && !isDeleting) {
      setTimeout(() => setIsDeleting(true), 2000);
      return;
    }

    if (subIndex === 0 && isDeleting) {
      setIsDeleting(false);
      setIndex((prev) => (prev + 1) % words.length);
      return;
    }

    const timeout = setTimeout(() => {
      setSubIndex((prev) => prev + (isDeleting ? -1 : 1));
    }, isDeleting ? 50 : 120);

    return () => clearTimeout(timeout);
  }, [subIndex, index, isDeleting, hasMounted]);

  if (!hasMounted) {
    return <span className="inline-block">{words[0]}</span>;
  }

  return (
    <span className="inline-block">
      {words[index].substring(0, subIndex)}
      <span className={`${blink ? "opacity-100" : "opacity-0"} ml-1 border-l-4 border-black dark:border-white h-full`}></span>
    </span>
  );
}