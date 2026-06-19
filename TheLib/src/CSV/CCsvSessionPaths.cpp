#include "CCsvSessionPaths.h"

#pragma managed(push, off)

#define NOMINMAX
#include <Windows.h>
#include <ShlObj.h>
#include <cwchar>
#include <filesystem>
#include <iterator>
#include <string>

#pragma comment(lib, "Shell32.lib")
#pragma comment(lib, "Ole32.lib")

namespace NativeCsv
{
    namespace
    {
        bool IsTestingMachine() noexcept
        {
            wchar_t name[MAX_COMPUTERNAME_LENGTH + 1]{};
            DWORD length = static_cast<DWORD>(std::size(name));

            if (!GetComputerNameW(name, &length))
                return false;

            return _wcsicmp(name, L"BOX") == 0;
        }

        std::filesystem::path GetKnownFolder(REFKNOWNFOLDERID folderId, const wchar_t* fallbackName)
        {
            PWSTR path = nullptr;

            if (SUCCEEDED(SHGetKnownFolderPath(folderId, 0, nullptr, &path)) && path != nullptr)
            {
                std::filesystem::path result(path);
                CoTaskMemFree(path);
                return result;
            }

            wchar_t userProfile[MAX_PATH]{};
            DWORD length = GetEnvironmentVariableW(L"USERPROFILE", userProfile, static_cast<DWORD>(std::size(userProfile)));

            if (length > 0 && length < std::size(userProfile))
                return std::filesystem::path(userProfile) / fallbackName;

            return std::filesystem::current_path();
        }

        std::filesystem::path PrepareTestingDirectory(const std::filesystem::path& asanoRoot)
        {
            std::error_code ec;
            std::filesystem::path current = asanoRoot / L"!!Testing";
            std::filesystem::path lastRun = current / L"!!LastRun";

            std::filesystem::create_directories(lastRun, ec);

            for (const std::filesystem::directory_entry& entry : std::filesystem::directory_iterator(lastRun, ec))
            {
                if (entry.is_regular_file(ec))
                    std::filesystem::remove(entry.path(), ec);
            }

            for (const std::filesystem::directory_entry& entry : std::filesystem::directory_iterator(current, ec))
            {
                if (!entry.is_regular_file(ec))
                    continue;

                std::filesystem::path target = lastRun / entry.path().filename();
                std::filesystem::remove(target, ec);
                std::filesystem::rename(entry.path(), target, ec);
            }

            return current;
        }

        std::wstring MakeClinicalStamp()
        {
            SYSTEMTIME now{};
            GetLocalTime(&now);

            wchar_t buffer[32]{};
            std::swprintf(
                buffer,
                std::size(buffer),
                L"%04hu-%02hu-%02hu_%02hu%02hu%02hu",
                now.wYear,
                now.wMonth,
                now.wDay,
                now.wHour,
                now.wMinute,
                now.wSecond);

            return buffer;
        }
    }

    std::wstring CCsvSessionPaths::CreateSessionDirectory()
    {
        bool testing = IsTestingMachine();
        std::filesystem::path root = GetKnownFolder(testing ? FOLDERID_Desktop : FOLDERID_Documents, testing ? L"Desktop" : L"Documents") / L"Asano";

        if (testing)
            return PrepareTestingDirectory(root).wstring();

        return (root / L"CsvSessions" / MakeClinicalStamp()).wstring();
    }
}

#pragma managed(pop)
