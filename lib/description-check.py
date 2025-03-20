import re

def main():
    # Read the input file
    with open('lib/example.txt', 'r', encoding='utf-8') as f:
        text = f.read()
    
    # Find a few course entries
    course_pattern = r'([A-Z]{3}\d{4})\s+((?:(?!(?:Ob|Op)\s+\d{2,3}\s+\d).)*?)(?=\s+(Ob|Op)\s+(\d+)\s+(\d+))'
    
    # Find the first 5 matches
    for i, match in enumerate(re.finditer(course_pattern, text)):
        if i >= 5:
            break
        
        code, name_raw, course_type_str, workload, credits = match.groups()
        
        # Get context around the match
        start = max(0, match.start() - 50)
        end = min(len(text), match.end() + 200)
        context = text[start:end]
        
        print(f"Course: {code} - {name_raw}")
        print(f"Type: {course_type_str}, Workload: {workload}, Credits: {credits}")
        print("Context:")
        print(context)
        print("\n" + "="*80 + "\n")

if __name__ == "__main__":
    main() 